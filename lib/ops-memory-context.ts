import type { AgentHistoryTurn } from "@/lib/ops-memory";
import {
  buildCentralMemoryContext,
  centralMemoryConfigured,
} from "@/lib/central-memory/search";
import { buildOpsMemoryContext } from "@/lib/ops-retrieval";

/**
 * PostgreSQL is authoritative. Obsidian stays a resilient, human-readable
 * projection while the migration is rolling out or if the database is absent.
 */
export async function buildUnifiedOpsMemoryContext(
  message: string,
  history: AgentHistoryTurn[] = [],
) {
  if (centralMemoryConfigured()) {
    try {
      const central = await buildCentralMemoryContext(message, history);
      if (central) return central;
    } catch (error) {
      console.error("OPS central memory retrieval failed; using Obsidian projection.", error);
    }
  }
  return buildOpsMemoryContext(message, history);
}
