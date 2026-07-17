import { promises as fs } from "node:fs";
import path from "node:path";
import { createCentralMemoryPool } from "@/lib/central-memory/database";
import { projectCentralMemoryToObsidian } from "@/lib/central-memory/obsidian-projection";

async function main() {
  const configuredVault = process.env.OBSIDIAN_VAULT_PATH?.trim();
  if (!configuredVault) throw new Error("OBSIDIAN_VAULT_PATH is required.");
  const vaultRoot = path.resolve(configuredVault);
  await fs.mkdir(vaultRoot, { recursive: true });

  const pool = createCentralMemoryPool();
  try {
    const result = await projectCentralMemoryToObsidian({
      queryable: pool,
      organizationSlug: process.env.OPS_ORGANIZATION_SLUG?.trim() || undefined,
      vaultRoot,
    });
    process.stdout.write(`${JSON.stringify({ status: "ok", ...result }, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Central memory projection failed: ${message}\n`);
  process.exitCode = 1;
});

