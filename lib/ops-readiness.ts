import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";

const DEFAULT_OPENCODE_BASE_URL = "http://127.0.0.1:4096";
const DEFAULT_OPENCODE_USERNAME = "opencode";
const DEFAULT_TIMEOUT_MS = 3_000;

type ReadinessEnvironment = {
  OBSIDIAN_VAULT_PATH?: string;
  OPS_DOCUMENTS_PATH?: string;
  OPENCODE_BASE_URL?: string;
  OPENCODE_SERVER_USERNAME?: string;
  OPENCODE_SERVER_PASSWORD?: string;
};

type ReadinessFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type DirectoryCheck = {
  status: "ok" | "error";
  readable: boolean;
  writable: boolean;
  latencyMs: number;
  detail?: "not_configured" | "not_a_directory" | "inaccessible";
};

type OpenCodeCheck = {
  status: "ok" | "error";
  authenticated: boolean;
  latencyMs: number;
  detail?: "not_configured" | "unreachable" | "unhealthy";
};

export type OpsReadiness = {
  status: "ready" | "degraded";
  service: "ops-web";
  timestamp: string;
  latencyMs: number;
  checks: {
    opencode: OpenCodeCheck;
    vault: DirectoryCheck;
    documents: DirectoryCheck;
  };
};

export type OpsReadinessOptions = {
  env?: ReadinessEnvironment;
  fetchImpl?: ReadinessFetch;
  timeoutMs?: number;
  now?: () => Date;
};

function elapsed(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function checkDirectory(configuredPath: string | undefined): Promise<DirectoryCheck> {
  const startedAt = performance.now();
  const candidate = configuredPath?.trim();
  if (!candidate) {
    return {
      status: "error",
      readable: false,
      writable: false,
      latencyMs: elapsed(startedAt),
      detail: "not_configured",
    };
  }

  try {
    const resolved = await fs.realpath(path.resolve(candidate));
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      return {
        status: "error",
        readable: false,
        writable: false,
        latencyMs: elapsed(startedAt),
        detail: "not_a_directory",
      };
    }

    // `access` and `readdir` validate the effective application identity
    // without creating a probe file or otherwise mutating customer data.
    await Promise.all([
      fs.access(resolved, constants.R_OK | constants.W_OK),
      fs.readdir(resolved),
    ]);
    return {
      status: "ok",
      readable: true,
      writable: true,
      latencyMs: elapsed(startedAt),
    };
  } catch {
    return {
      status: "error",
      readable: false,
      writable: false,
      latencyMs: elapsed(startedAt),
      detail: "inaccessible",
    };
  }
}

async function checkOpenCode(
  env: ReadinessEnvironment,
  fetchImpl: ReadinessFetch,
  timeoutMs: number,
): Promise<OpenCodeCheck> {
  const startedAt = performance.now();
  const password = env.OPENCODE_SERVER_PASSWORD?.trim();
  if (!password) {
    return {
      status: "error",
      authenticated: false,
      latencyMs: elapsed(startedAt),
      detail: "not_configured",
    };
  }

  let healthUrl: URL;
  try {
    const baseUrl = new URL(env.OPENCODE_BASE_URL?.trim() || DEFAULT_OPENCODE_BASE_URL);
    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") throw new Error("protocol");
    healthUrl = new URL("global/health", `${baseUrl.toString().replace(/\/$/, "")}/`);
  } catch {
    return {
      status: "error",
      authenticated: false,
      latencyMs: elapsed(startedAt),
      detail: "not_configured",
    };
  }

  const username = env.OPENCODE_SERVER_USERNAME?.trim() || DEFAULT_OPENCODE_USERNAME;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    const response = await fetchImpl(healthUrl, {
      method: "GET",
      headers: { Authorization: authorization },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        status: "error",
        authenticated: false,
        latencyMs: elapsed(startedAt),
        detail: "unreachable",
      };
    }

    const payload = await response.json().catch(() => null) as { healthy?: unknown } | null;
    if (payload?.healthy !== true) {
      return {
        status: "error",
        authenticated: true,
        latencyMs: elapsed(startedAt),
        detail: "unhealthy",
      };
    }
    return {
      status: "ok",
      authenticated: true,
      latencyMs: elapsed(startedAt),
    };
  } catch {
    return {
      status: "error",
      authenticated: false,
      latencyMs: elapsed(startedAt),
      detail: "unreachable",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOpsReadiness(options: OpsReadinessOptions = {}): Promise<OpsReadiness> {
  const startedAt = performance.now();
  const sourceEnv = options.env ?? process.env;
  const env: ReadinessEnvironment = {
    OBSIDIAN_VAULT_PATH: sourceEnv.OBSIDIAN_VAULT_PATH,
    OPS_DOCUMENTS_PATH: sourceEnv.OPS_DOCUMENTS_PATH,
    OPENCODE_BASE_URL: sourceEnv.OPENCODE_BASE_URL,
    OPENCODE_SERVER_USERNAME: sourceEnv.OPENCODE_SERVER_USERNAME,
    OPENCODE_SERVER_PASSWORD: sourceEnv.OPENCODE_SERVER_PASSWORD,
  };
  const documentsPath = env.OPS_DOCUMENTS_PATH?.trim()
    || path.join(os.tmpdir(), "ops-generated-documents");
  const [opencode, vault, documents] = await Promise.all([
    checkOpenCode(env, options.fetchImpl ?? fetch, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    checkDirectory(env.OBSIDIAN_VAULT_PATH),
    checkDirectory(documentsPath),
  ]);
  const ready = [opencode, vault, documents].every((check) => check.status === "ok");

  return {
    status: ready ? "ready" : "degraded",
    service: "ops-web",
    timestamp: (options.now ?? (() => new Date()))().toISOString(),
    latencyMs: elapsed(startedAt),
    checks: { opencode, vault, documents },
  };
}
