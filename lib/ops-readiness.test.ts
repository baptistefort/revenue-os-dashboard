import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOpsReadiness } from "@/lib/ops-readiness";

test("readiness checks authenticated OpenCode and non-mutating directory access", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ops-readiness-"));
  const vault = path.join(root, "vault");
  const documents = path.join(root, "documents");
  await Promise.all([fs.mkdir(vault), fs.mkdir(documents)]);
  const secret = "readiness-secret-never-returned";
  let observedAuthorization = "";

  try {
    const result = await getOpsReadiness({
      env: {
        OBSIDIAN_VAULT_PATH: vault,
        OPS_DOCUMENTS_PATH: documents,
        OPENCODE_BASE_URL: "http://opencode.internal:4096",
        OPENCODE_SERVER_USERNAME: "ops-health",
        OPENCODE_SERVER_PASSWORD: secret,
      },
      fetchImpl: async (input, init) => {
        assert.equal(String(input), "http://opencode.internal:4096/global/health");
        observedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        return Response.json({ healthy: true });
      },
      now: () => new Date("2026-07-17T09:00:00.000Z"),
    });

    assert.equal(result.status, "ready");
    assert.equal(result.checks.opencode.authenticated, true);
    assert.equal(result.checks.vault.readable, true);
    assert.equal(result.checks.vault.writable, true);
    assert.equal(result.checks.documents.readable, true);
    assert.equal(result.checks.documents.writable, true);
    assert.equal(
      observedAuthorization,
      `Basic ${Buffer.from(`ops-health:${secret}`).toString("base64")}`,
    );
    assert.doesNotMatch(JSON.stringify(result), /readiness-secret|opencode\.internal|ops-readiness-/);
    assert.deepEqual(await fs.readdir(vault), []);
    assert.deepEqual(await fs.readdir(documents), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("readiness degrades without credentials or writable storage", async () => {
  const result = await getOpsReadiness({
    env: {
      OBSIDIAN_VAULT_PATH: "/path/that/does/not/exist",
      OPS_DOCUMENTS_PATH: "/another/path/that/does/not/exist",
      OPENCODE_BASE_URL: "http://127.0.0.1:4096",
      OPENCODE_SERVER_USERNAME: "opencode",
      OPENCODE_SERVER_PASSWORD: "",
    },
    fetchImpl: async () => {
      throw new Error("must not be called without credentials");
    },
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.checks.opencode.detail, "not_configured");
  assert.equal(result.checks.vault.detail, "inaccessible");
  assert.equal(result.checks.documents.detail, "inaccessible");
});
