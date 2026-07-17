import { writeObsidianRecord } from "@/lib/obsidian-write";

function compact(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function safeTitle(question: string) {
  const title = compact(question.replace(/[?.!]+$/g, ""), 110);
  return title || "Analyse de direction";
}

function businessDate() {
  const configured = process.env.OPS_BUSINESS_DATE?.trim();
  if (configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)) return configured;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Paris",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/**
 * Compiles a sourced answer into the living Obsidian wiki.
 *
 * Raw evidence stays immutable. This note is explicitly marked as derived and
 * links back to every verified source, so later answers can reuse the
 * synthesis without confusing it with primary evidence.
 */
export async function persistSourcedAgentAnalysis(input: {
  question: string;
  answer: string;
  sources: string[];
}) {
  const sources = [...new Set(input.sources.map((source) => source.trim()).filter(Boolean))]
    .slice(0, 20);
  if (!sources.length || !input.answer.trim()) return null;

  return writeObsidianRecord({
    idPrefix: "ANALYSIS",
    folder: "11_Wiki/Analyses",
    type: "analysis",
    title: safeTitle(input.question),
    summary: compact(input.answer, 280),
    body: `## Question

${input.question.trim()}

## Synthèse compilée

${input.answer.trim()}

## Statut

Cette synthèse est dérivée des preuves reliées ci-dessous. En cas de contradiction, les sources datées les plus récentes priment.`,
    relations: sources,
    attributes: {
      record_kind: "analysis",
      derived: true,
      source_count: sources.length,
      status: "compiled",
      period: businessDate(),
    },
    source: "OPS Agent — synthèse sourcée",
    actor: "OPS Agent",
  });
}
