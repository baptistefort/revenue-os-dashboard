export type AgentHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Shared text normalization only. Company facts live in the Obsidian vault and
 * are retrieved by OpenCode tools; this module intentionally contains no
 * business records.
 */
export function normalizeMemoryQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMemoryIds(value: string) {
  return [...new Set(
    value
      .toLocaleUpperCase("fr")
      .match(/\b[A-Z][A-Z0-9]{1,20}(?:-[A-Z0-9]{1,30})+\b/g)
      ?? [],
  )];
}
