import path from "node:path";
import {
  buildObsidianVaultIndex,
  findObsidianMemoryRecord,
  getRelatedObsidianMemory,
  searchObsidianMemory,
  type ObsidianFrontmatterValue,
  type ObsidianMemoryRecord,
  type ObsidianVaultIndex,
} from "@/lib/obsidian-vault-memory";
import { resolveOpsDemoVaultRoot } from "@/lib/obsidian-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

const MAX_SOURCE_ID_LENGTH = 180;
const RELATED_SOURCE_LIMIT = 8;
const PRIVATE_PATH_ATTRIBUTE = /(?:absolute|filesystem|local|vault)[_.-]?(?:file)?path|vault[_.-]?root/i;
const INTERNAL_ORIGIN_LABEL = /\b(?:demo|d[ée]monstration|test|ficti(?:f|ve)|seed)\b/i;

function normalizeLookup(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.md$/i, "")
    .replace(/\s+—\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSourceId(raw: string) {
  if (!raw || raw.length > MAX_SOURCE_ID_LENGTH * 3) return null;
  let decoded = raw;
  if (raw.includes("%")) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  const id = decoded.trim();
  if (
    !id
    || id.length > MAX_SOURCE_ID_LENGTH
    || id === "."
    || id === ".."
    || /[\u0000-\u001f\u007f]/.test(id)
    || /[\\/]/.test(id)
    || /^(?:file|https?):/i.test(id)
  ) return null;
  return id;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactLocalPaths(value: string, vaultRoot: string) {
  let safe = value;
  const roots = [
    vaultRoot,
    vaultRoot.replaceAll(path.sep, "/"),
    ...(vaultRoot.startsWith("/private/var/") ? [vaultRoot.slice("/private".length)] : []),
  ].filter(Boolean);
  for (const root of new Set(roots)) {
    safe = safe.replace(new RegExp(escapeRegExp(root), "gi"), "[mémoire OPS]");
  }
  return safe
    .replace(/file:\/\/[^\s<>'"`]+/gi, "[chemin local]")
    .replace(/(?:^|\s)\/(?:Users|home|srv|var|tmp|private|opt|etc)\/[^\r\n<>'"`]+/g, (match) => (
      match.startsWith(" ") ? " [chemin local]" : "[chemin local]"
    ))
    .replace(/\b[A-Za-z]:\\[^\r\n<>'"`]+/g, "[chemin local]");
}

function safeRelativePath(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized
    || path.posix.isAbsolute(normalized)
    || normalized.split("/").some((part) => part === "..")
  ) return path.posix.basename(normalized || "source.md");
  return normalized;
}

function publicSourceLabel(value: string | null, vaultRoot: string) {
  if (!value) return null;
  const safe = redactLocalPaths(value, vaultRoot).trim();
  if (!safe || INTERNAL_ORIGIN_LABEL.test(safe)) return "Mémoire OPS";
  return safe;
}

function sanitizeAttribute(
  value: ObsidianFrontmatterValue,
  vaultRoot: string,
): ObsidianFrontmatterValue {
  if (typeof value === "string") return redactLocalPaths(value, vaultRoot);
  if (Array.isArray(value)) {
    return value.map((entry) => (
      typeof entry === "string" ? redactLocalPaths(entry, vaultRoot) : entry
    ));
  }
  return value;
}

function publicAttributes(record: ObsidianMemoryRecord, vaultRoot: string) {
  return Object.fromEntries(
    Object.entries(record.attributes)
      .filter(([key]) => !PRIVATE_PATH_ATTRIBUTE.test(key))
      .map(([key, value]) => [key, sanitizeAttribute(value, vaultRoot)]),
  );
}

function publicRecord(record: ObsidianMemoryRecord, vaultRoot: string) {
  return {
    id: record.id,
    title: redactLocalPaths(record.title, vaultRoot),
    type: record.type,
    summary: redactLocalPaths(record.summary, vaultRoot),
    facts: record.facts.map((fact) => redactLocalPaths(fact, vaultRoot)),
    relations: record.relations.map((relation) => redactLocalPaths(relation, vaultRoot)),
    updatedAt: record.updatedAt,
    source: publicSourceLabel(record.source, vaultRoot),
    path: safeRelativePath(record.path),
    attributes: publicAttributes(record, vaultRoot),
    content: redactLocalPaths(record.content, vaultRoot),
  };
}

function conservativeFallback(index: ObsidianVaultIndex, id: string) {
  const matches = searchObsidianMemory(index, id, 3);
  const first = matches[0];
  if (!first || first.score < 100) return null;

  const lookup = normalizeLookup(id);
  const recordId = normalizeLookup(first.record.id);
  const title = normalizeLookup(first.record.title);
  const secondScore = matches[1]?.score ?? 0;
  const unambiguous = first.score - secondScore >= 30;
  const exactTitleMatches = index.records.filter(
    (record) => normalizeLookup(record.title) === lookup,
  );
  const partialIdMatches = lookup.length >= 6
    ? index.records.filter((record) => {
      const candidate = normalizeLookup(record.id);
      return candidate.startsWith(lookup) || candidate.endsWith(lookup);
    })
    : [];
  const strongMatch = (
    title === lookup
    && exactTitleMatches.length === 1
    && exactTitleMatches[0]?.id === first.record.id
  ) || (
    partialIdMatches.length === 1
    && partialIdMatches[0]?.id === first.record.id
    && (recordId.startsWith(lookup) || recordId.endsWith(lookup))
  );
  return unambiguous && strongMatch ? first.record : null;
}

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rawId = (await context.params).id;
  const id = parseSourceId(rawId);
  if (!id) return errorResponse("invalid_source_id", 400);

  try {
    const root = await resolveOpsDemoVaultRoot();
    const index = await buildObsidianVaultIndex(root);
    const exact = findObsidianMemoryRecord(index, id);
    const record = exact ?? conservativeFallback(index, id);
    if (!record) return errorResponse("source_not_found", 404);

    const related = getRelatedObsidianMemory(index, record, RELATED_SOURCE_LIMIT).map(
      ({ record: relatedRecord, relation }) => ({
        relation,
        id: relatedRecord.id,
        title: redactLocalPaths(relatedRecord.title, index.root),
        type: relatedRecord.type,
        summary: redactLocalPaths(relatedRecord.summary, index.root),
        updatedAt: relatedRecord.updatedAt,
        source: publicSourceLabel(relatedRecord.source, index.root),
        path: safeRelativePath(relatedRecord.path),
      }),
    );

    return Response.json(
      { ...publicRecord(record, index.root), related },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.warn("[sources] Enterprise memory unavailable.", error);
    return errorResponse("memory_unavailable", 503);
  }
}
