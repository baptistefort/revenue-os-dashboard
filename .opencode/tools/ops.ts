import { promises as fs } from "node:fs";
import { tool } from "@opencode-ai/plugin";
import {
  OBSIDIAN_MEMORY_LIMITS,
  buildObsidianVaultIndex,
  findObsidianMemoryRecord,
  getRelatedObsidianMemory,
  resolveObsidianVaultRoot,
  resolveSafeObsidianNote,
  searchObsidianMemory,
  type ObsidianMemoryRecord,
  type ObsidianVaultIndex,
} from "../../lib/obsidian-vault-memory.ts";
import {
  centralMemoryConfigured,
  getCentralMemoryRecord,
  getRelatedCentralMemory,
  searchCentralMemory,
} from "../../lib/central-memory/search.ts";

const MAX_MEMORY_RESULTS = 12;
const MAX_VAULT_RESULTS = 12;
const MAX_SNIPPET_CHARS = 900;
const DEFAULT_CACHE_TTL_MS = 5_000;

let indexCache: {
  root: string;
  expiresAt: number;
  value: ObsidianVaultIndex;
} | null = null;
let pendingIndex: Promise<ObsidianVaultIndex> | null = null;

function json(value: unknown) {
  return JSON.stringify(value);
}

function clampInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value as number)));
}

function cacheTtlMs() {
  const configured = Number(process.env.OBSIDIAN_MEMORY_CACHE_TTL_MS);
  return Number.isFinite(configured)
    ? Math.max(0, Math.min(60_000, configured))
    : DEFAULT_CACHE_TTL_MS;
}

async function loadIndex() {
  const root = await resolveObsidianVaultRoot();
  if (!root) return null;
  const now = Date.now();
  if (indexCache?.root === root && indexCache.expiresAt > now) return indexCache.value;
  if (pendingIndex) return pendingIndex;

  pendingIndex = buildObsidianVaultIndex(root);
  try {
    const value = await pendingIndex;
    indexCache = {
      root,
      value,
      expiresAt: Date.now() + cacheTtlMs(),
    };
    return value;
  } finally {
    pendingIndex = null;
  }
}

function boundedContent(content: string, maximum = OBSIDIAN_MEMORY_LIMITS.maxRecordContentChars) {
  if (content.length <= maximum) return content;
  return `${content.slice(0, maximum)}\n\n[contenu tronqué]`;
}

function compactRecord(record: ObsidianMemoryRecord) {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    summary: record.summary,
    facts: record.facts,
    relations: record.relations,
    aliases: record.aliases,
    updatedAt: record.updatedAt,
    source: record.source,
    path: record.path,
    attributes: record.attributes,
    content: boundedContent(record.content),
  };
}

function searchSnippet(record: ObsidianMemoryRecord, query: string) {
  const clean = record.content
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[`*_>#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return record.summary;

  const normalized = clean.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = query
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  const matches = tokens.map((token) => normalized.indexOf(token)).filter((position) => position >= 0);
  const first = matches.length ? Math.min(...matches) : 0;
  const start = Math.max(0, first - 180);
  const end = Math.min(clean.length, start + MAX_SNIPPET_CHARS);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

function indexMeta(index: ObsidianVaultIndex) {
  return {
    indexedAt: index.indexedAt,
    scannedFiles: index.scannedFiles,
    scannedBytes: index.scannedBytes,
    truncatedScan: index.truncated,
  };
}

export const memory_search = tool({
  description:
    "Recherche read-only dans la mémoire centrale versionnée de l'entreprise. PostgreSQL contient les événements et objets bruts ; Obsidian reste le repli visuel lorsque la mémoire centrale n'est pas configurée.",
  args: {
    query: tool.schema.string().min(2).max(500).describe(
      "Question, sujet, client, projet, période ou identifiant à rechercher dans la mémoire Obsidian.",
    ),
    limit: tool.schema.number().int().min(1).max(MAX_MEMORY_RESULTS).optional().describe(
      "Nombre maximal de notes retournées.",
    ),
  },
  async execute({ query, limit }) {
    const cappedLimit = clampInteger(limit, 8, MAX_MEMORY_RESULTS);
    if (centralMemoryConfigured()) {
      try {
        const records = await searchCentralMemory({ query, limit: cappedLimit });
        if (records.length) {
          return json({
            ok: true,
            memory: "central",
            authority: "postgresql",
            query,
            count: records.length,
            records,
          });
        }
      } catch (error) {
        console.error("Central memory tool search failed; using Obsidian.", error);
      }
    }
    const index = await loadIndex();
    if (!index) return json({ ok: false, error: "vault_not_configured" });
    const matches = searchObsidianMemory(index, query, cappedLimit);
    return json({
      ok: true,
      memory: "obsidian",
      query,
      count: matches.length,
      ...indexMeta(index),
      records: matches.map(({ record, score }) => ({
        score,
        ...compactRecord(record),
      })),
    });
  },
});

export const memory_get = tool({
  description:
    "Lit un enregistrement précis de la mémoire centrale à partir de son identifiant métier ou source. Se replie sur la projection Obsidian si nécessaire. N'invente jamais un enregistrement absent.",
  args: {
    id: tool.schema.string().min(2).max(1_000).describe(
      "Identifiant exact ou chemin de note, par exemple VAL-061, PROJET-241 ou 07_Finance/Factures/....md.",
    ),
  },
  async execute({ id }) {
    if (centralMemoryConfigured()) {
      try {
        const record = await getCentralMemoryRecord({ id: id.trim() });
        if (record) {
          return json({
            ok: true,
            memory: "central",
            authority: "postgresql",
            record,
          });
        }
      } catch (error) {
        console.error("Central memory tool get failed; using Obsidian.", error);
      }
    }
    const index = await loadIndex();
    if (!index) return json({ ok: false, error: "vault_not_configured" });
    const record = findObsidianMemoryRecord(index, id.trim());
    if (!record) {
      return json({
        ok: false,
        error: "not_found",
        requested: id.trim(),
        ...indexMeta(index),
      });
    }
    return json({
      ok: true,
      memory: "obsidian",
      ...indexMeta(index),
      record: compactRecord(record),
    });
  },
});

export const memory_related = tool({
  description:
    "Suit les identifiants et relations d'un objet dans la mémoire centrale. Retourne les preuves connexes ; se replie sur les wikilinks Obsidian si nécessaire.",
  args: {
    id: tool.schema.string().min(2).max(1_000).describe(
      "Identifiant, alias ou chemin de la note source.",
    ),
    limit: tool.schema.number().int().min(1).max(MAX_MEMORY_RESULTS).optional().describe(
      "Nombre maximal de relations directes retournées.",
    ),
  },
  async execute({ id, limit }) {
    const cappedLimit = clampInteger(limit, MAX_MEMORY_RESULTS, MAX_MEMORY_RESULTS);
    if (centralMemoryConfigured()) {
      try {
        const related = await getRelatedCentralMemory({
          id: id.trim(),
          limit: cappedLimit,
        });
        if (related.source) {
          return json({
            ok: true,
            memory: "central",
            authority: "postgresql",
            source: related.source,
            count: related.records.length,
            records: related.records,
          });
        }
      } catch (error) {
        console.error("Central memory related lookup failed; using Obsidian.", error);
      }
    }
    const index = await loadIndex();
    if (!index) return json({ ok: false, error: "vault_not_configured" });
    const source = findObsidianMemoryRecord(index, id.trim());
    if (!source) {
      return json({
        ok: false,
        error: "not_found",
        requested: id.trim(),
        ...indexMeta(index),
      });
    }
    const related = getRelatedObsidianMemory(index, source, cappedLimit);
    return json({
      ok: true,
      memory: "obsidian",
      source: {
        id: source.id,
        title: source.title,
        path: source.path,
      },
      count: related.length,
      ...indexMeta(index),
      records: related.map(({ record, relation }) => ({
        relation,
        ...compactRecord(record),
      })),
    });
  },
});

export const vault_search = tool({
  description:
    "Recherche read-only dans les fichiers Markdown du vault Obsidian. Retourne des chemins relatifs sûrs, identifiants, titres et extraits ; aucun fichier externe au vault n'est accessible.",
  args: {
    query: tool.schema.string().min(2).max(500).describe(
      "Mots, titre, identifiant ou sujet à rechercher dans le vault.",
    ),
    limit: tool.schema.number().int().min(1).max(MAX_VAULT_RESULTS).optional().describe(
      "Nombre maximal de notes retournées.",
    ),
  },
  async execute({ query, limit }) {
    const index = await loadIndex();
    if (!index) return json({ ok: false, error: "vault_not_configured" });
    const cappedLimit = clampInteger(limit, 8, MAX_VAULT_RESULTS);
    const matches = searchObsidianMemory(index, query, cappedLimit);
    return json({
      ok: true,
      memory: "obsidian",
      query,
      count: matches.length,
      ...indexMeta(index),
      results: matches.map(({ record, score }) => ({
        id: record.id,
        type: record.type,
        title: record.title,
        path: record.path,
        updatedAt: record.updatedAt,
        score,
        snippet: searchSnippet(record, query),
      })),
    });
  },
});

export const vault_read = tool({
  description:
    "Lit une note Markdown précise du vault Obsidian à partir d'un chemin relatif retourné par ops_vault_search. Les chemins absolus, traversées et liens symboliques sont refusés.",
  args: {
    path: tool.schema.string().min(1).max(1_000).describe(
      "Chemin relatif exact de la note dans le vault.",
    ),
  },
  async execute({ path: relativePath }) {
    const root = await resolveObsidianVaultRoot();
    if (!root) return json({ ok: false, error: "vault_not_configured" });
    const note = await resolveSafeObsidianNote(root, relativePath);
    if (!note) return json({ ok: false, error: "invalid_or_missing_path" });

    const content = await fs.readFile(note.absolutePath, "utf8");
    const truncated = content.length > OBSIDIAN_MEMORY_LIMITS.maxReadChars;
    return json({
      ok: true,
      memory: "obsidian",
      path: note.relativePath,
      size: note.size,
      truncated,
      content: truncated
        ? `${content.slice(0, OBSIDIAN_MEMORY_LIMITS.maxReadChars)}\n\n[contenu tronqué]`
        : content,
    });
  },
});
