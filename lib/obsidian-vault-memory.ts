import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

export const OBSIDIAN_MEMORY_LIMITS = {
  maxFiles: 1_500,
  maxFileBytes: 384 * 1024,
  maxTotalBytes: 48 * 1024 * 1024,
  maxRecordContentChars: 4_500,
  maxReadChars: 32_000,
  maxFacts: 18,
  maxRelations: 32,
} as const;

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".obsidian",
  ".trash",
  ".next",
  "node_modules",
]);

const STRUCTURAL_FRONTMATTER_KEYS = new Set([
  "id",
  "type",
  "title",
  "aliases",
  "alias",
  "demo",
  "organization",
  "created_at",
  "createdat",
  "updated_at",
  "updatedat",
  "confidence",
  "source",
  "tags",
  "cssclasses",
]);

const SEARCH_STOP_WORDS = new Set([
  "ai",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "cette",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "en",
  "est",
  "et",
  "faire",
  "fait",
  "il",
  "la",
  "le",
  "les",
  "me",
  "mes",
  "mon",
  "nous",
  "on",
  "ou",
  "par",
  "pour",
  "pourquoi",
  "que",
  "quel",
  "quelle",
  "qui",
  "quoi",
  "se",
  "ses",
  "son",
  "sur",
  "tu",
  "un",
  "une",
  "vous",
]);

export type ObsidianFrontmatterValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean>;

export type ObsidianMemoryRecord = {
  id: string;
  type: string;
  title: string;
  summary: string;
  facts: string[];
  relations: string[];
  aliases: string[];
  updatedAt: string;
  source: string | null;
  path: string;
  attributes: Record<string, ObsidianFrontmatterValue>;
  content: string;
};

export type ObsidianVaultIndex = {
  root: string;
  records: ObsidianMemoryRecord[];
  scannedFiles: number;
  scannedBytes: number;
  truncated: boolean;
  indexedAt: string;
};

type VaultFile = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

type ParsedMarkdown = {
  frontmatter: Record<string, ObsidianFrontmatterValue>;
  body: string;
};

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookup(value: string) {
  return normalizeText(value)
    .replace(/\.md$/i, "")
    .replace(/\s+—\s+.*$/, "")
    .trim();
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative === ""
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".."
      && !path.isAbsolute(relative))
  );
}

function posixRelative(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    if (trimmed.startsWith("\"")) {
      try {
        return JSON.parse(trimmed) as string;
      } catch {
        // Fall back to a conservative unquote for hand-written frontmatter.
      }
    }
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseScalar(raw: string): ObsidianFrontmatterValue {
  const value = raw.trim();
  if (!value) return "";
  if (value === "null" || value === "~") return null;
  if (/^(true|false)$/i.test(value)) return value.toLocaleLowerCase("fr") === "true";
  if (/^-?(?:\d+|\d*\.\d+)$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((entry) => parseScalar(entry)).filter(
      (entry): entry is string | number | boolean => entry !== null && !Array.isArray(entry),
    );
  }
  return unquote(value);
}

export function parseObsidianMarkdown(content: string): ParsedMarkdown {
  const matched = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!matched) return { frontmatter: {}, body: content };

  const block = matched[1];
  const body = content.slice(matched[0].length);
  const frontmatter: Record<string, ObsidianFrontmatterValue> = {};
  let activeListKey: string | null = null;

  for (const rawLine of block.split(/\r?\n/)) {
    const listMatch = rawLine.match(/^\s*-\s+(.+?)\s*$/);
    if (listMatch && activeListKey) {
      const previous = frontmatter[activeListKey];
      const entries = Array.isArray(previous) ? previous : [];
      const parsed = parseScalar(listMatch[1]);
      if (parsed !== null && !Array.isArray(parsed)) {
        frontmatter[activeListKey] = [...entries, parsed];
      }
      continue;
    }

    const pair = rawLine.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!pair) {
      activeListKey = null;
      continue;
    }

    const key = pair[1];
    const rawValue = pair[2] ?? "";
    if (!rawValue.trim()) {
      frontmatter[key] = [];
      activeListKey = key;
      continue;
    }
    frontmatter[key] = parseScalar(rawValue);
    activeListKey = null;
  }

  return { frontmatter, body };
}

function stringValue(value: ObsidianFrontmatterValue | undefined) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function stringList(value: ObsidianFrontmatterValue | undefined) {
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  const scalar = stringValue(value);
  return scalar ? [scalar] : [];
}

function cleanMarkdownInline(value: string) {
  return value
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => label || target)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bodyWithoutOperationalSections(body: string) {
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  let excluded = false;

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1];
    if (heading) {
      const normalized = normalizeText(heading);
      excluded = /^(relations?|provenance|liens?|backlinks?)$/.test(normalized);
      if (!excluded) kept.push(line);
      continue;
    }
    if (!excluded) kept.push(line);
  }

  return kept.join("\n");
}

function firstSummary(body: string) {
  const content = bodyWithoutOperationalSections(body)
    .replace(/^#{1,6}\s+.+$/gm, "")
    .split(/\n\s*\n/)
    .map((paragraph) => cleanMarkdownInline(paragraph.replace(/^\s*[-*+]\s+/gm, "")))
    .find((paragraph) => paragraph.length >= 12);
  return content?.slice(0, 700) ?? "";
}

function extractFacts(
  body: string,
  frontmatter: Record<string, ObsidianFrontmatterValue>,
) {
  const facts: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (STRUCTURAL_FRONTMATTER_KEYS.has(normalizeText(key))) continue;
    const rendered = Array.isArray(value) ? value.join(", ") : value;
    if (rendered === null || rendered === "") continue;
    facts.push(`${key.replace(/[_-]+/g, " ")} : ${String(rendered)}`);
  }

  const usableBody = bodyWithoutOperationalSections(body);
  for (const line of usableBody.split(/\r?\n/)) {
    const bullet = line.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/)?.[1];
    if (!bullet) continue;
    const cleaned = cleanMarkdownInline(bullet);
    if (cleaned.length >= 6) facts.push(cleaned);
  }

  const seen = new Set<string>();
  return facts.filter((fact) => {
    const normalized = normalizeText(fact);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, OBSIDIAN_MEMORY_LIMITS.maxFacts);
}

export function extractWikiLinks(content: string) {
  const relations: string[] = [];
  const seen = new Set<string>();
  const regex = /!?\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content))) {
    const target = match[1]
      .split("|", 1)[0]
      .split("#", 1)[0]
      .trim()
      .replace(/\.md$/i, "");
    if (!target) continue;
    const key = normalizeText(target);
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push(target);
    if (relations.length >= OBSIDIAN_MEMORY_LIMITS.maxRelations) break;
  }
  return relations;
}

function recordContent(body: string) {
  const normalized = bodyWithoutOperationalSections(body).trim();
  if (normalized.length <= OBSIDIAN_MEMORY_LIMITS.maxRecordContentChars) return normalized;
  return `${normalized.slice(0, OBSIDIAN_MEMORY_LIMITS.maxRecordContentChars)}\n\n[contenu tronqué]`;
}

function deriveId(frontmatter: Record<string, ObsidianFrontmatterValue>, relativePath: string) {
  const explicit = stringValue(frontmatter.id);
  if (explicit) return explicit.toLocaleUpperCase("fr");
  const base = path.basename(relativePath, path.extname(relativePath));
  const prefix = base.split(/\s+—\s+/, 1)[0].trim();
  return prefix || base;
}

function deriveTitle(
  frontmatter: Record<string, ObsidianFrontmatterValue>,
  body: string,
  relativePath: string,
) {
  const explicit = stringValue(frontmatter.title);
  if (explicit) return explicit;
  const heading = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  return heading || path.basename(relativePath, path.extname(relativePath));
}

async function listMarkdownFiles(root: string) {
  const files: VaultFile[] = [];
  const pending = [root];
  let totalBytes = 0;
  let truncated = false;

  while (
    pending.length
    && files.length < OBSIDIAN_MEMORY_LIMITS.maxFiles
    && totalBytes < OBSIDIAN_MEMORY_LIMITS.maxTotalBytes
  ) {
    const directory = pending.shift();
    if (!directory) break;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, "fr"));
    for (const entry of entries) {
      if (
        files.length >= OBSIDIAN_MEMORY_LIMITS.maxFiles
        || totalBytes >= OBSIDIAN_MEMORY_LIMITS.maxTotalBytes
      ) {
        truncated = true;
        break;
      }
      if (entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;

      const absolutePath = path.join(directory, entry.name);
      if (!isInside(root, absolutePath)) continue;
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLocaleLowerCase("fr") !== ".md") continue;

      try {
        const stats = await fs.stat(absolutePath);
        if (stats.size > OBSIDIAN_MEMORY_LIMITS.maxFileBytes) continue;
        if (totalBytes + stats.size > OBSIDIAN_MEMORY_LIMITS.maxTotalBytes) {
          truncated = true;
          continue;
        }
        files.push({
          absolutePath,
          relativePath: posixRelative(root, absolutePath),
          size: stats.size,
        });
        totalBytes += stats.size;
      } catch {
        // Synchronization can remove a note between readdir and stat.
      }
    }
  }

  return {
    files,
    scannedBytes: totalBytes,
    truncated: truncated || pending.length > 0,
  };
}

export async function resolveObsidianVaultRoot(configuredPath = process.env.OBSIDIAN_VAULT_PATH) {
  const configured = configuredPath?.trim();
  if (!configured) return null;
  try {
    const resolved = await fs.realpath(path.resolve(configured));
    const stats = await fs.stat(resolved);
    return stats.isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

export async function buildObsidianVaultIndex(root: string): Promise<ObsidianVaultIndex> {
  const safeRoot = await resolveObsidianVaultRoot(root);
  if (!safeRoot) throw new Error("Obsidian vault unavailable");
  const scan = await listMarkdownFiles(safeRoot);
  const records: ObsidianMemoryRecord[] = [];

  for (let offset = 0; offset < scan.files.length; offset += 32) {
    const batch = await Promise.all(scan.files.slice(offset, offset + 32).map(async (file) => {
      try {
        const raw = await fs.readFile(file.absolutePath, "utf8");
        const parsed = parseObsidianMarkdown(raw);
        const aliases = [
          ...stringList(parsed.frontmatter.aliases),
          ...stringList(parsed.frontmatter.alias),
        ];
        return {
          id: deriveId(parsed.frontmatter, file.relativePath),
          type: stringValue(parsed.frontmatter.type) || "note",
          title: deriveTitle(parsed.frontmatter, parsed.body, file.relativePath),
          summary: firstSummary(parsed.body),
          facts: extractFacts(parsed.body, parsed.frontmatter),
          relations: extractWikiLinks(raw),
          aliases: [...new Set(aliases)],
          updatedAt:
            stringValue(parsed.frontmatter.updated_at)
            || stringValue(parsed.frontmatter.updatedAt)
            || new Date(0).toISOString(),
          source: stringValue(parsed.frontmatter.source) || null,
          path: file.relativePath,
          attributes: Object.fromEntries(
            Object.entries(parsed.frontmatter).filter(
              ([key]) => !STRUCTURAL_FRONTMATTER_KEYS.has(normalizeText(key)),
            ),
          ),
          content: recordContent(parsed.body),
        } satisfies ObsidianMemoryRecord;
      } catch {
        // One malformed note must never make the whole enterprise memory unavailable.
        return null;
      }
    }));
    records.push(...batch.filter((record): record is ObsidianMemoryRecord => Boolean(record)));
  }

  return {
    root: safeRoot,
    records,
    scannedFiles: scan.files.length,
    scannedBytes: scan.scannedBytes,
    truncated: scan.truncated,
    indexedAt: new Date().toISOString(),
  };
}

function queryTokens(query: string) {
  return normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token))
    .slice(0, 32);
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  return Math.max(0, haystack.split(needle).length - 1);
}

export function scoreObsidianRecord(record: ObsidianMemoryRecord, query: string) {
  const phrase = normalizeText(query);
  const tokens = queryTokens(query);
  if (!phrase || !tokens.length) return 0;

  const id = normalizeText(record.id);
  const title = normalizeText(record.title);
  const aliases = normalizeText(record.aliases.join(" "));
  const notePath = normalizeText(record.path);
  const body = normalizeText([
    record.summary,
    record.facts.join(" "),
    record.content,
    Object.values(record.attributes).flat().join(" "),
  ].join(" "));

  let score = 0;
  if (id === phrase || normalizeLookup(record.id) === normalizeLookup(query)) score += 500;
  else if (id.includes(phrase)) score += 180;
  if (title.includes(phrase)) score += 110;
  if (aliases.includes(phrase)) score += 85;
  if (notePath.includes(phrase)) score += 45;
  if (body.includes(phrase)) score += 35;

  for (const token of tokens) {
    if (id.includes(token)) score += 35;
    if (title.includes(token)) score += 18;
    if (aliases.includes(token)) score += 12;
    if (notePath.includes(token)) score += 6;
    score += Math.min(countOccurrences(body, token), 8) * 2;
  }
  return score;
}

export function searchObsidianMemory(
  index: ObsidianVaultIndex,
  query: string,
  limit: number,
) {
  return index.records
    .map((record) => ({ record, score: scoreObsidianRecord(record, query) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score
        || right.record.updatedAt.localeCompare(left.record.updatedAt)
        || left.record.path.localeCompare(right.record.path, "fr"),
    )
    .slice(0, limit);
}

export function findObsidianMemoryRecord(index: ObsidianVaultIndex, id: string) {
  const lookup = normalizeLookup(id);
  if (!lookup) return null;
  return index.records.find((record) => {
    if (normalizeLookup(record.id) === lookup) return true;
    if (normalizeLookup(record.path) === lookup) return true;
    if (normalizeLookup(path.basename(record.path, ".md")) === lookup) return true;
    return record.aliases.some((alias) => normalizeLookup(alias) === lookup);
  }) ?? null;
}

function relationLookupCandidates(target: string) {
  const cleaned = target.replace(/\.md$/i, "").trim();
  const basename = path.basename(cleaned);
  return [...new Set([
    normalizeLookup(cleaned),
    normalizeLookup(basename),
    normalizeLookup(basename.split(/\s+—\s+/, 1)[0]),
  ].filter(Boolean))];
}

function relationTargetsRecord(target: string, record: ObsidianMemoryRecord) {
  const candidates = relationLookupCandidates(target);
  const recordCandidates = new Set([
    normalizeLookup(record.id),
    normalizeLookup(record.title),
    normalizeLookup(record.path),
    normalizeLookup(path.basename(record.path, ".md")),
    ...record.aliases.map(normalizeLookup),
  ]);
  return candidates.some((candidate) => recordCandidates.has(candidate));
}

export function getRelatedObsidianMemory(
  index: ObsidianVaultIndex,
  source: ObsidianMemoryRecord,
  limit: number,
) {
  const outgoing = index.records.filter(
    (record) =>
      record.id !== source.id
      && source.relations.some((target) => relationTargetsRecord(target, record)),
  );
  const incoming = index.records.filter(
    (record) =>
      record.id !== source.id
      && record.relations.some((target) => relationTargetsRecord(target, source)),
  );

  const incomingIds = new Set(incoming.map((record) => record.id));
  const combined = [
    ...outgoing.map((record) => ({
      record,
      relation: incomingIds.has(record.id) ? "bidirectional" as const : "outgoing" as const,
    })),
    ...incoming
      .filter((record) => !outgoing.some((candidate) => candidate.id === record.id))
      .map((record) => ({ record, relation: "incoming" as const })),
  ];
  return combined.slice(0, limit);
}

export async function resolveSafeObsidianNote(root: string, relativePath: string) {
  if (
    !relativePath
    || relativePath.includes("\0")
    || path.isAbsolute(relativePath)
    || path.extname(relativePath).toLocaleLowerCase("fr") !== ".md"
  ) return null;

  try {
    const safeRoot = await fs.realpath(root);
    const candidate = path.resolve(safeRoot, relativePath);
    if (!isInside(safeRoot, candidate)) return null;
    const realCandidate = await fs.realpath(candidate);
    if (!isInside(safeRoot, realCandidate)) return null;
    const stats = await fs.stat(realCandidate);
    if (
      !stats.isFile()
      || stats.size > OBSIDIAN_MEMORY_LIMITS.maxFileBytes
      || path.extname(realCandidate).toLocaleLowerCase("fr") !== ".md"
    ) return null;
    return {
      absolutePath: realCandidate,
      relativePath: posixRelative(safeRoot, realCandidate),
      size: stats.size,
    };
  } catch {
    return null;
  }
}
