import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { invalidateOpsMemoryCache } from "@/lib/ops-retrieval";
import {
  buildObsidianVaultIndex,
  findObsidianMemoryRecord,
  resolveObsidianVaultRoot,
} from "@/lib/obsidian-vault-memory";

const MEMORY_ROOT = "OPS — Atelier Beaumarchais";
const LEGACY_MEMORY_ROOT = "OPS Demo — Atelier Beaumarchais";
const ORG_LINK = "ORG-001 — Atelier Beaumarchais";
const RELATION_ALIASES = new Map([
  ["direction", "WIKI-DIRECTION-20260716"],
  ["strategie", "WIKI-DIRECTION-20260716"],
  ["seo", "WIKI-SEO-20260716"],
  ["equipe", "WIKI-PEOPLE-20260716"],
  ["rh", "WIKI-PEOPLE-20260716"],
  ["achats", "WIKI-SUPPLY-20260716"],
  ["stock", "WIKI-SUPPLY-20260716"],
  ["fournisseurs", "WIKI-SUPPLY-20260716"],
  ["risques", "WIKI-RISK-20260716"],
  ["conformite", "WIKI-RISK-20260716"],
  ["commercial", "CRM-SNAPSHOT-20260716"],
  ["crm", "CRM-SNAPSHOT-20260716"],
  ["finance", "FIN-SNAPSHOT-20260716"],
  ["emails", "MAIL-DIGEST-20260716"],
  ["operations", "OPS-SNAPSHOT-20260716"],
  ["planning", "OPS-SNAPSHOT-20260716"],
]);
const RESERVED_FRONTMATTER_KEYS = new Set([
  "id",
  "type",
  "title",
  "demo",
  "managed_by",
  "organization",
  "created_at",
  "updated_at",
  "confidence",
  "source",
]);
let operationalWriteQueue = Promise.resolve();

export type WritableObsidianValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean>;

export type ObsidianWriteInput = {
  id?: string;
  idPrefix: string;
  folder: string;
  type: string;
  title: string;
  summary: string;
  body?: string;
  relations?: string[];
  attributes?: Record<string, WritableObsidianValue>;
  source?: string;
  actor?: string;
};

export type ObsidianWriteResult = {
  id: string;
  title: string;
  relativePath: string;
  absolutePath: string;
  createdAt: string;
};

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeRelation(value: string) {
  return value
    .replace(/\[\[|\]\]/g, "")
    .replace(/[\r\n\t|#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function normalizeRelationAlias(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yamlScalar(value: string | number | boolean | null) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function yamlValue(value: WritableObsidianValue) {
  if (!Array.isArray(value)) return yamlScalar(value);
  return `[${value.map(yamlScalar).join(", ")}]`;
}

function createId(prefix: string) {
  const normalizedPrefix = prefix
    .toLocaleUpperCase("fr")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18) || "REC";
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 5).toLocaleUpperCase("fr");
  return `${normalizedPrefix}-${stamp}-${suffix}`;
}

export async function resolveOpsDemoVaultRoot() {
  const vault = await resolveObsidianVaultRoot();
  if (!vault) throw new Error("obsidian_vault_unavailable");
  const baseName = path.basename(vault);
  if (baseName === MEMORY_ROOT || baseName === LEGACY_MEMORY_ROOT) return vault;
  const preferred = path.join(vault, MEMORY_ROOT);
  const legacy = path.join(vault, LEGACY_MEMORY_ROOT);
  let root = preferred;
  try {
    await fs.access(preferred);
  } catch {
    try {
      await fs.access(legacy);
      root = legacy;
    } catch {
      root = preferred;
    }
  }
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function appendText(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, content, "utf8");
}

async function ensureOperationalFile(
  filePath: string,
  id: "INDEX" | "LOG",
  title: string,
  body: string,
) {
  try {
    await fs.access(filePath);
    return;
  } catch {
    // Initialisation atomique ci-dessous.
  }
  const createdAt = new Date().toISOString();
  const markdown = `---
id: ${id}
type: knowledge
title: ${JSON.stringify(title)}
managed_by: ops-memory
organization: "[[${ORG_LINK}]]"
created_at: ${createdAt}
updated_at: ${createdAt}
confidence: 1.0
source: "OPS Application"
status: ${id === "LOG" ? "append_only" : "maintained"}
---

# ${title}

${body}
`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, markdown, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function updateOperationalFiles(
  root: string,
  result: ObsidianWriteResult,
  actor: string,
  action: "created" | "updated" | "archived" = "created",
) {
  const logPath = path.join(root, "00_System", "LOG — Journal de la mémoire OPS.md");
  const indexPath = path.join(root, "00_System", "INDEX — Index de la mémoire OPS.md");
  await ensureOperationalFile(
    logPath,
    "LOG",
    "Journal de la mémoire OPS",
    "Journal chronologique append-only des ingestions et actions contrôlées.\n",
  );
  await ensureOperationalFile(
    indexPath,
    "INDEX",
    "Index de la mémoire OPS",
    "Index d'entrée de la mémoire vivante.\n\n## Éléments créés par l'application\n",
  );
  const localTimestamp = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
  }).format(new Date());

  const linkTarget = path.basename(result.relativePath, ".md");
  await appendText(
    logPath,
    `\n## [${result.createdAt}] ${action} | ${result.id}\n\n${actor} a ${action === "created" ? "créé" : action === "archived" ? "archivé" : "mis à jour"} [[${linkTarget}]] depuis l'application OPS (${localTimestamp}).\n`,
  );

  let index = "";
  try {
    index = await fs.readFile(indexPath, "utf8");
  } catch {
    // Le prochain seed recréera l'en-tête ; l'élément reste néanmoins indexé.
  }
  const link = `- [[${linkTarget}]] — créé depuis l'application OPS.`;
  if (!index.includes(`[[${linkTarget}]]`)) {
    if (!index.includes("## Éléments créés par l'application")) {
      await appendText(indexPath, "\n## Éléments créés par l'application\n\n");
    }
    await appendText(indexPath, `${link}\n`);
  }
}

async function enqueueOperationalUpdate(
  root: string,
  result: ObsidianWriteResult,
  actor: string,
  action: "created" | "updated" | "archived" = "created",
) {
  const update = operationalWriteQueue.then(
    () => updateOperationalFiles(root, result, actor, action),
    () => updateOperationalFiles(root, result, actor, action),
  );
  operationalWriteQueue = update.catch(() => undefined);
  await update;
}

async function canonicalRelations(root: string, candidates: string[]) {
  let index = null;
  try {
    index = await buildObsidianVaultIndex(root);
  } catch {
    // Les liens restent utilisables comme identifiants même pendant une synchro.
  }
  return [...new Set(candidates.map(normalizeRelation).filter(Boolean).map((candidate) => {
    const aliased = RELATION_ALIASES.get(normalizeRelationAlias(candidate)) ?? candidate;
    if (!index) return aliased;
    const record = findObsidianMemoryRecord(index, aliased);
    return record ? path.basename(record.path, ".md") : aliased;
  }))];
}

export async function writeObsidianRecord(
  input: ObsidianWriteInput,
): Promise<ObsidianWriteResult> {
  const root = await resolveOpsDemoVaultRoot();
  const requestedId = input.id?.trim().toLocaleUpperCase("fr");
  if (requestedId && !/^[A-Z0-9][A-Z0-9-]{5,79}$/.test(requestedId)) {
    throw new Error("invalid_obsidian_record_id");
  }
  const id = requestedId || createId(input.idPrefix);
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 180);
  const folder = input.folder
    .split("/")
    .map(safeFileName)
    .filter((segment) => Boolean(segment) && segment !== "." && segment !== "..")
    .join("/");
  if (!title || !folder) throw new Error("invalid_obsidian_record");

  const createdAt = new Date().toISOString();
  const directory = path.join(root, folder);
  const fileName = `${id} — ${safeFileName(title)}.md`;
  const absolutePath = path.join(directory, fileName);
  const relations = await canonicalRelations(root, [
    ORG_LINK,
    ...(input.relations ?? []),
  ]);
  const attributes = {
    ...(input.attributes ?? {}),
    app_created: true,
  };
  const renderedAttributes = Object.entries(attributes)
    .filter(([key]) => (
      /^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)
      && !RESERVED_FRONTMATTER_KEYS.has(key.toLocaleLowerCase("en"))
    ))
    .map(([key, value]) => `${key}: ${yamlValue(value)}`)
    .join("\n");
  const type = input.type.replace(/[\r\n]/g, " ").trim().slice(0, 80) || "note";
  const markdown = `---
id: ${id}
type: ${JSON.stringify(type)}
title: ${JSON.stringify(title)}
managed_by: ops-memory
organization: "[[${ORG_LINK}]]"
created_at: ${createdAt}
updated_at: ${createdAt}
confidence: 1.0
source: ${JSON.stringify(input.source ?? "OPS Application")}
${renderedAttributes}
---

# ${title}

${input.summary.trim()}

${input.body?.trim() ? `${input.body.trim()}\n\n` : ""}## Relations

${relations.map((relation) => `- [[${relation}]]`).join("\n")}

## Provenance

Élément créé depuis l'application OPS. Toute action externe reste soumise à validation.
`;

  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, markdown, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, absolutePath);

  const result = {
    id,
    title,
    relativePath: path.relative(root, absolutePath).split(path.sep).join("/"),
    absolutePath,
    createdAt,
  };
  const actor = (input.actor ?? "Marie Delmas")
    .replace(/[\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "OPS";
  try {
    await enqueueOperationalUpdate(root, result, actor);
  } catch (error) {
    // La note est déjà commitée atomiquement : un journal momentanément
    // indisponible ne doit pas transformer une création réussie en échec.
    console.error("[OPS] Obsidian operational index update failed.", error);
  }
  invalidateOpsMemoryCache();
  return result;
}

/**
 * Met à jour une note existante sans casser son chemin ni ses liens Obsidian.
 * L'appelant doit avoir résolu un identifiant exact dans le vault OPS : cette
 * fonction refuse donc toute création implicite et toute traversée de chemin.
 */
export async function updateObsidianRecord(
  input: ObsidianWriteInput & { id: string },
): Promise<ObsidianWriteResult> {
  const root = await resolveOpsDemoVaultRoot();
  const id = input.id.trim().toLocaleUpperCase("fr");
  if (!/^[A-Z0-9][A-Z0-9-]{5,79}$/.test(id)) {
    throw new Error("invalid_obsidian_record_id");
  }

  const index = await buildObsidianVaultIndex(root);
  const record = findObsidianMemoryRecord(index, id);
  if (!record || record.id.toLocaleUpperCase("fr") !== id) {
    throw new Error("obsidian_record_not_found");
  }

  const absolutePath = path.resolve(root, record.path);
  const relative = path.relative(root, absolutePath);
  if (
    relative === ""
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("obsidian_record_outside_vault");
  }

  const previous = await fs.readFile(absolutePath, "utf8");
  const previousCreatedAt = previous.match(/^created_at:\s*(.+?)\s*$/mi)?.[1]?.trim();
  const createdAt = previousCreatedAt || record.updatedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!title) throw new Error("invalid_obsidian_record");
  const relations = await canonicalRelations(root, [
    ORG_LINK,
    ...(input.relations ?? record.relations),
  ]);
  const attributes: Record<string, WritableObsidianValue> = {
    ...record.attributes,
    ...(input.attributes ?? {}),
    app_created: true,
  };
  const renderedAttributes = Object.entries(attributes)
    .filter(([key]) => (
      /^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)
      && !RESERVED_FRONTMATTER_KEYS.has(key.toLocaleLowerCase("en"))
    ))
    .map(([key, value]) => `${key}: ${yamlValue(value)}`)
    .join("\n");
  const type = input.type.replace(/[\r\n]/g, " ").trim().slice(0, 80) || record.type || "note";
  const markdown = `---
id: ${id}
type: ${JSON.stringify(type)}
title: ${JSON.stringify(title)}
managed_by: ops-memory
organization: "[[${ORG_LINK}]]"
created_at: ${createdAt}
updated_at: ${updatedAt}
confidence: 1.0
source: ${JSON.stringify(input.source ?? record.source ?? "OPS Application")}
${renderedAttributes}
---

# ${title}

${input.summary.trim()}

${input.body?.trim() ? `${input.body.trim()}\n\n` : ""}## Relations

${relations.map((relation) => `- [[${relation}]]`).join("\n")}

## Provenance

Élément mis à jour depuis l'application OPS. Toute action externe reste soumise à validation.
`;

  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, markdown, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, absolutePath);

  const result = {
    id,
    title,
    relativePath: record.path.split(path.sep).join("/"),
    absolutePath,
    createdAt: updatedAt,
  };
  const actor = (input.actor ?? "Marie Delmas")
    .replace(/[\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "OPS";
  const action = attributes.archived === true ? "archived" : "updated";
  try {
    await enqueueOperationalUpdate(root, result, actor, action);
  } catch (error) {
    console.error("[OPS] Obsidian operational index update failed.", error);
  }
  invalidateOpsMemoryCache();
  return result;
}
