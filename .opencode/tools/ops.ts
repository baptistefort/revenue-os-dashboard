import { promises as fs } from "node:fs";
import path from "node:path";
import { tool } from "@opencode-ai/plugin";
import {
  getMemoryRecord,
  getRelatedMemory,
  searchCompanyMemory,
  type OpsMemoryRecord,
} from "../../lib/ops-memory.ts";

const MAX_MEMORY_RESULTS = 12;
const MAX_VAULT_RESULTS = 12;
const MAX_VAULT_FILES_SCANNED = 800;
const MAX_VAULT_FILE_BYTES = 256 * 1024;
const MAX_VAULT_TOTAL_BYTES_SCANNED = 24 * 1024 * 1024;
const MAX_VAULT_READ_CHARS = 24_000;
const MAX_SNIPPET_CHARS = 700;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".obsidian",
  ".trash",
  ".next",
  "node_modules",
]);

type CompactMemoryRecord = {
  id: string;
  type: OpsMemoryRecord["type"];
  title: string;
  summary: string;
  facts: string[];
  relations: string[];
  updatedAt: string;
};

type VaultFile = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

function compactMemory(record: OpsMemoryRecord): CompactMemoryRecord {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    summary: record.summary,
    facts: record.facts,
    relations: record.relations,
    updatedAt: record.updatedAt,
  };
}

function json(value: unknown) {
  return JSON.stringify(value);
}

function clampInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value as number)));
}

function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(query: string) {
  return normalizeSearchText(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 24);
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function vaultRoot() {
  const configured = process.env.OBSIDIAN_VAULT_PATH?.trim();
  if (!configured) return null;

  try {
    const resolved = await fs.realpath(path.resolve(configured));
    const stats = await fs.stat(resolved);
    return stats.isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function posixRelative(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

async function listVaultMarkdownFiles(root: string) {
  const files: VaultFile[] = [];
  const pending = [root];
  let totalBytes = 0;
  let capped = false;

  while (
    pending.length
    && files.length < MAX_VAULT_FILES_SCANNED
    && totalBytes < MAX_VAULT_TOTAL_BYTES_SCANNED
  ) {
    const directory = pending.shift();
    if (!directory) break;

    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    for (const entry of entries) {
      if (
        files.length >= MAX_VAULT_FILES_SCANNED
        || totalBytes >= MAX_VAULT_TOTAL_BYTES_SCANNED
      ) break;
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
        if (stats.size > MAX_VAULT_FILE_BYTES) continue;
        if (totalBytes + stats.size > MAX_VAULT_TOTAL_BYTES_SCANNED) {
          capped = true;
          continue;
        }
        files.push({
          absolutePath,
          relativePath: posixRelative(root, absolutePath),
          size: stats.size,
        });
        totalBytes += stats.size;
      } catch {
        // A file can disappear while the vault is being synchronized.
      }
    }
  }

  return {
    files,
    scannedBytes: totalBytes,
    capped: capped || pending.length > 0 || files.length >= MAX_VAULT_FILES_SCANNED,
  };
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, "");
}

function noteTitle(content: string, relativePath: string) {
  const frontmatterTitle = content.match(/^title:\s*["']?(.+?)["']?\s*$/mi)?.[1]?.trim();
  const heading = stripFrontmatter(content).match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  return frontmatterTitle || heading || path.basename(relativePath, path.extname(relativePath));
}

function buildSnippet(content: string, tokens: string[]) {
  const clean = stripFrontmatter(content)
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";

  const normalized = normalizeSearchText(clean);
  const indexes = tokens
    .map((token) => normalized.indexOf(token))
    .filter((index) => index >= 0);
  const firstMatch = indexes.length ? Math.min(...indexes) : 0;
  const start = Math.max(0, firstMatch - 160);
  const end = Math.min(clean.length, start + MAX_SNIPPET_CHARS);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

function vaultScore(content: string, relativePath: string, tokens: string[]) {
  const normalizedBody = normalizeSearchText(content);
  const normalizedPath = normalizeSearchText(relativePath);
  return tokens.reduce((score, token) => {
    const pathMatch = normalizedPath.includes(token) ? 4 : 0;
    const bodyMatches = normalizedBody.split(token).length - 1;
    return score + pathMatch + Math.min(bodyMatches, 6);
  }, 0);
}

async function resolveVaultNote(root: string, relativePath: string) {
  if (!relativePath || relativePath.includes("\0") || path.isAbsolute(relativePath)) return null;

  const candidate = path.resolve(root, relativePath);
  if (!isInside(root, candidate)) return null;

  try {
    const realCandidate = await fs.realpath(candidate);
    if (!isInside(root, realCandidate)) return null;
    const stats = await fs.stat(realCandidate);
    if (!stats.isFile() || stats.size > MAX_VAULT_FILE_BYTES) return null;
    if (path.extname(realCandidate).toLocaleLowerCase("fr") !== ".md") return null;
    return { absolutePath: realCandidate, size: stats.size };
  } catch {
    return null;
  }
}

export const memory_search = tool({
  description:
    "Recherche read-only dans la mémoire structurée OPS. Chaque résultat contient déjà les faits complets : ne pas relire ensuite chaque identifiant.",
  args: {
    query: tool.schema.string().min(2).max(500).describe("Question, sujet, client, projet ou identifiant recherché."),
    limit: tool.schema.number().int().min(1).max(MAX_MEMORY_RESULTS).optional().describe("Nombre maximal de résultats."),
  },
  async execute({ query, limit }) {
    const cappedLimit = clampInteger(limit, 8, MAX_MEMORY_RESULTS);
    const records = searchCompanyMemory(query, [], cappedLimit);
    return json({
      ok: true,
      query,
      count: records.length,
      records: records.map(compactMemory),
    });
  },
});

export const memory_get = tool({
  description: "Lit un enregistrement précis de la mémoire OPS à partir de son identifiant exact.",
  args: {
    id: tool.schema.string().min(2).max(80).describe("Identifiant exact, par exemple VAL-061 ou PROJET-241."),
  },
  async execute({ id }) {
    const record = getMemoryRecord(id.trim());
    if (!record) return json({ ok: false, error: "not_found", id: id.trim().toLocaleUpperCase("fr") });
    return json({ ok: true, record: compactMemory(record) });
  },
});

export const memory_related = tool({
  description: "Retourne les relations directes avec leurs faits complets. Une seule lecture suffit ; ne pas relire chaque relation séparément.",
  args: {
    id: tool.schema.string().min(2).max(80).describe("Identifiant exact de l'enregistrement source."),
    limit: tool.schema.number().int().min(1).max(MAX_MEMORY_RESULTS).optional().describe("Nombre maximal de relations."),
  },
  async execute({ id, limit }) {
    const record = getMemoryRecord(id.trim());
    if (!record) return json({ ok: false, error: "not_found", id: id.trim().toLocaleUpperCase("fr") });
    const cappedLimit = clampInteger(limit, MAX_MEMORY_RESULTS, MAX_MEMORY_RESULTS);
    const related = getRelatedMemory(record).slice(0, cappedLimit);
    return json({
      ok: true,
      source: record.id,
      count: related.length,
      records: related.map(compactMemory),
    });
  },
});

export const vault_search = tool({
  description:
    "Recherche read-only dans les notes Markdown du vault Obsidian configuré. Retourne des chemins relatifs sûrs et des extraits.",
  args: {
    query: tool.schema.string().min(2).max(500).describe("Mots, titre, identifiant ou sujet à rechercher dans le vault."),
    limit: tool.schema.number().int().min(1).max(MAX_VAULT_RESULTS).optional().describe("Nombre maximal de notes retournées."),
  },
  async execute({ query, limit }) {
    const root = await vaultRoot();
    if (!root) return json({ ok: false, error: "vault_not_configured" });

    const tokens = searchTokens(query);
    if (!tokens.length) return json({ ok: false, error: "invalid_query" });

    const scan = await listVaultMarkdownFiles(root);
    const files = scan.files;
    const scored = await Promise.all(files.map(async (file) => {
      try {
        const content = await fs.readFile(file.absolutePath, "utf8");
        const score = vaultScore(content, file.relativePath, tokens);
        if (score <= 0) return null;
        return {
          path: file.relativePath,
          title: noteTitle(content, file.relativePath),
          snippet: buildSnippet(content, tokens),
          size: file.size,
          score,
        };
      } catch {
        return null;
      }
    }));

    const cappedLimit = clampInteger(limit, 8, MAX_VAULT_RESULTS);
    const results = scored
      .filter((result): result is NonNullable<typeof result> => Boolean(result))
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "fr"))
      .slice(0, cappedLimit);

    return json({
      ok: true,
      query,
      scanned: files.length,
      scannedBytes: scan.scannedBytes,
      count: results.length,
      truncatedScan: scan.capped,
      results,
    });
  },
});

export const vault_read = tool({
  description:
    "Lit une note Markdown précise du vault Obsidian à partir d'un chemin relatif retourné par ops_vault_search.",
  args: {
    path: tool.schema.string().min(1).max(1_000).describe("Chemin relatif de la note dans le vault."),
  },
  async execute({ path: relativePath }) {
    const root = await vaultRoot();
    if (!root) return json({ ok: false, error: "vault_not_configured" });

    const note = await resolveVaultNote(root, relativePath);
    if (!note) return json({ ok: false, error: "invalid_or_missing_path" });

    const content = await fs.readFile(note.absolutePath, "utf8");
    const truncated = content.length > MAX_VAULT_READ_CHARS;
    return json({
      ok: true,
      path: posixRelative(root, note.absolutePath),
      title: noteTitle(content, relativePath),
      size: note.size,
      truncated,
      content: truncated ? `${content.slice(0, MAX_VAULT_READ_CHARS)}\n\n[contenu tronqué]` : content,
    });
  },
});
