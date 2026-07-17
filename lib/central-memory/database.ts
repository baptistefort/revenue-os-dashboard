import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export type SqlQueryable = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
};

export type TransactionClient = SqlQueryable & {
  release(): void;
};

export type CentralMemoryPool = SqlQueryable & {
  connect(): Promise<TransactionClient>;
  end(): Promise<void>;
};

type DatabaseEnvironment = {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  DATABASE_POOL_MAX?: string;
  DATABASE_CONNECTION_TIMEOUT_MS?: string;
  DATABASE_IDLE_TIMEOUT_MS?: string;
  DATABASE_STATEMENT_TIMEOUT_MS?: string;
  DATABASE_APPLICATION_NAME?: string;
};

export type CentralMemoryPoolConfig = {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statement_timeout: number;
  application_name: string;
  allowExitOnIdle: boolean;
  keepAlive: boolean;
};

const GLOBAL_POOL_KEY = Symbol.for("ops.central-memory.pool");
const globalWithPool = globalThis as typeof globalThis & {
  [GLOBAL_POOL_KEY]?: CentralMemoryPool;
};

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function centralMemoryPoolConfig(
  env: DatabaseEnvironment = process.env,
): CentralMemoryPoolConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to use the OPS central memory.");
  }
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }

  return {
    connectionString,
    max: boundedInteger(env.DATABASE_POOL_MAX, 10, 1, 50),
    connectionTimeoutMillis: boundedInteger(
      env.DATABASE_CONNECTION_TIMEOUT_MS,
      4_000,
      250,
      30_000,
    ),
    idleTimeoutMillis: boundedInteger(env.DATABASE_IDLE_TIMEOUT_MS, 30_000, 1_000, 300_000),
    statement_timeout: boundedInteger(
      env.DATABASE_STATEMENT_TIMEOUT_MS,
      15_000,
      500,
      120_000,
    ),
    application_name: env.DATABASE_APPLICATION_NAME?.trim() || "ops-web",
    allowExitOnIdle: process.env.NODE_ENV !== "production",
    keepAlive: true,
  };
}

function asCentralMemoryPool(pool: Pool): CentralMemoryPool {
  return {
    query: (text, values) => pool.query(text, values),
    connect: async () => {
      const client: PoolClient = await pool.connect();
      return {
        query: (text, values) => client.query(text, values),
        release: () => client.release(),
      };
    },
    end: () => pool.end(),
  };
}

export function createCentralMemoryPool(
  env: DatabaseEnvironment = process.env,
): CentralMemoryPool {
  return asCentralMemoryPool(new Pool(centralMemoryPoolConfig(env)));
}

export function getCentralMemoryPool(): CentralMemoryPool {
  if (!globalWithPool[GLOBAL_POOL_KEY]) {
    globalWithPool[GLOBAL_POOL_KEY] = createCentralMemoryPool();
  }
  return globalWithPool[GLOBAL_POOL_KEY];
}

export async function closeCentralMemoryPool() {
  const pool = globalWithPool[GLOBAL_POOL_KEY];
  if (!pool) return;
  delete globalWithPool[GLOBAL_POOL_KEY];
  await pool.end();
}

export type CentralMemoryDatabaseCheck = {
  status: "ok" | "error";
  connected: boolean;
  migrated: boolean;
  vector: boolean;
  latencyMs: number;
  detail?: "not_configured" | "unreachable" | "schema_missing";
};

export async function checkCentralMemoryDatabase(options: {
  pool?: SqlQueryable;
  env?: DatabaseEnvironment;
  timeoutMs?: number;
} = {}): Promise<CentralMemoryDatabaseCheck> {
  const startedAt = performance.now();
  if (!options.pool && !options.env?.DATABASE_URL && !process.env.DATABASE_URL) {
    return {
      status: "error",
      connected: false,
      migrated: false,
      vector: false,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      detail: "not_configured",
    };
  }

  const pool = options.pool ?? createCentralMemoryPool(options.env);
  const timeoutMs = options.timeoutMs ?? 3_000;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      pool.query<{
        schema_ready: boolean;
        vector_ready: boolean;
      }>(`
        SELECT
          to_regclass('ops_memory.source_events') IS NOT NULL
            AND to_regclass('ops_memory.entities') IS NOT NULL
            AND to_regclass('ops_memory.audit_logs') IS NOT NULL AS schema_ready,
          EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector_ready
      `),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("database readiness timeout")), timeoutMs);
      }),
    ]);
    const schemaReady = result.rows[0]?.schema_ready === true;
    return {
      status: schemaReady ? "ok" : "error",
      connected: true,
      migrated: schemaReady,
      vector: result.rows[0]?.vector_ready === true,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...(schemaReady ? {} : { detail: "schema_missing" as const }),
    };
  } catch {
    return {
      status: "error",
      connected: false,
      migrated: false,
      vector: false,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      detail: "unreachable",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (!options.pool && "end" in pool && typeof pool.end === "function") {
      await pool.end();
    }
  }
}
