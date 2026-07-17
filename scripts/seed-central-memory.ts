import { generateAtelierBeaumarchaisUniverse } from "@/lib/atelier-beaumarchais-universe";
import { createCentralMemoryPool } from "@/lib/central-memory/database";
import { loadAtelierUniverseToCentralMemory } from "@/lib/central-memory/universe-loader";

async function main() {
  const pool = createCentralMemoryPool();
  try {
    const universe = generateAtelierBeaumarchaisUniverse({
      seed: process.env.OPS_UNIVERSE_SEED?.trim() || undefined,
      asOf: process.env.OPS_UNIVERSE_AS_OF?.trim() || undefined,
    });
    const result = await loadAtelierUniverseToCentralMemory(pool, universe, {
      batchSize: process.env.OPS_UNIVERSE_BATCH_SIZE
        ? Number.parseInt(process.env.OPS_UNIVERSE_BATCH_SIZE, 10)
        : undefined,
      sourceAccountId: process.env.OPS_UNIVERSE_SOURCE_ACCOUNT_ID,
    });
    process.stdout.write(`${JSON.stringify({ status: "ok", ...result }, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Central memory seed failed: ${message}\n`);
  process.exitCode = 1;
});
