import assert from "node:assert/strict";
import test from "node:test";
import {
  centralMemoryPoolConfig,
  checkCentralMemoryDatabase,
  type SqlQueryable,
} from "@/lib/central-memory/database";

test("central memory pool config validates and bounds operational limits", () => {
  const config = centralMemoryPoolConfig({
    DATABASE_URL: "postgresql://ops:secret@database:5432/ops",
    DATABASE_POOL_MAX: "999",
    DATABASE_CONNECTION_TIMEOUT_MS: "10",
    DATABASE_IDLE_TIMEOUT_MS: "9999999",
    DATABASE_STATEMENT_TIMEOUT_MS: "4200",
    DATABASE_APPLICATION_NAME: "ops-ingestion",
  });

  assert.equal(config.max, 50);
  assert.equal(config.connectionTimeoutMillis, 250);
  assert.equal(config.idleTimeoutMillis, 300_000);
  assert.equal(config.statement_timeout, 4_200);
  assert.equal(config.application_name, "ops-ingestion");
});

test("central memory pool config rejects missing or non-postgres URLs", () => {
  assert.throws(() => centralMemoryPoolConfig({}), /DATABASE_URL is required/);
  assert.throws(
    () => centralMemoryPoolConfig({ DATABASE_URL: "https://database.example" }),
    /postgres or postgresql/,
  );
});

test("database readiness distinguishes migrated schema and vector acceleration", async () => {
  const pool: SqlQueryable = {
    query: async () => ({
      rows: [{ schema_ready: true, vector_ready: false }],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    }) as never,
  };
  const result = await checkCentralMemoryDatabase({ pool });

  assert.equal(result.status, "ok");
  assert.equal(result.connected, true);
  assert.equal(result.migrated, true);
  assert.equal(result.vector, false);
});

test("database readiness reports an unconfigured database without connecting", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await checkCentralMemoryDatabase({ env: {} });
    assert.deepEqual(
      {
        status: result.status,
        connected: result.connected,
        migrated: result.migrated,
        detail: result.detail,
      },
      {
        status: "error",
        connected: false,
        migrated: false,
        detail: "not_configured",
      },
    );
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
