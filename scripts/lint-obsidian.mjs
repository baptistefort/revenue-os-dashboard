import { promises as fs } from "node:fs";
import path from "node:path";

const SEEDED_ROOT = "OPS — Atelier Beaumarchais";
const CENTRAL_ROOT = "Central";
const CENTRAL_PROJECTOR = "ops-central-memory-projector";
const configuredVault = process.env.OBSIDIAN_VAULT_PATH?.trim();

if (!configuredVault) {
  console.error("OBSIDIAN_VAULT_PATH is required.");
  process.exit(2);
}

const configuredRoot = path.resolve(configuredVault);
const skippedDirectories = new Set([".git", ".obsidian", ".trash", ".next", "node_modules"]);
const relationAliases = new Map([
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

async function isDirectory(directory) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function resolveValidationRoots(root) {
  if (!await isDirectory(root)) {
    throw new Error(`Obsidian vault is not a readable directory: ${root}`);
  }

  const baseName = path.basename(root);
  if (baseName === SEEDED_ROOT || baseName === CENTRAL_ROOT) return [root];

  const recognizedChildren = [SEEDED_ROOT, CENTRAL_ROOT]
    .map((name) => path.join(root, name));
  const existingChildren = [];
  for (const candidate of recognizedChildren) {
    if (await isDirectory(candidate)) existingChildren.push(candidate);
  }
  return existingChildren.length ? existingChildren : [root];
}

async function markdownFiles(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(absolutePath));
    } else if (entry.isFile() && entry.name.toLocaleLowerCase("fr").endsWith(".md")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "mi"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function present(value) {
  return Boolean(value && !["null", "~"].includes(value.trim().toLocaleLowerCase("fr")));
}

function validJson(value, predicate) {
  if (!present(value)) return false;
  try {
    return predicate(JSON.parse(value));
  } catch {
    return false;
  }
}

function validCentralProvenance(value) {
  return validJson(value, (parsed) => (
    parsed !== null
    && typeof parsed === "object"
    && !Array.isArray(parsed)
    && ["source_type", "source_id", "source_version", "source_updated_at"]
      .every((key) => Object.hasOwn(parsed, key))
  ));
}

function validCentralRelations(value) {
  return validJson(value, (parsed) => (
    Array.isArray(parsed) && parsed.every((link) => typeof link === "string")
  ));
}

function normalize(value) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr");
}

function wikiLinks(content) {
  const links = [];
  const matcher = /!?\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = matcher.exec(content))) {
    const target = match[1].split("|", 1)[0].split("#", 1)[0].trim();
    if (target) links.push(target);
  }
  return [...new Set(links)];
}

function fileStem(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function recordIdFromStem(stem) {
  return stem.split(/\s+—\s+/, 1)[0].trim();
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function wikiPathFrom(base, file) {
  if (!inside(base, file)) return "";
  return path.relative(base, file)
    .split(path.sep)
    .join("/")
    .replace(/\.md$/i, "");
}

const validationRoots = await resolveValidationRoots(configuredRoot);
const root = validationRoots.length === 1 ? validationRoots[0] : configuredRoot;
const files = (await Promise.all(validationRoots.map(markdownFiles))).flat();
const records = [];

for (const file of files) {
  const content = await fs.readFile(file, "utf8");
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const stem = fileStem(file);
  const frontmatterFields = Object.fromEntries([
    "id",
    "canonical_key",
    "type",
    "title",
    "organization_id",
    "organization_slug",
    "organization",
    "status",
    "confidence",
    "confidentiality",
    "updated_at",
    "managed_by",
    "source",
    "provenance",
    "relations",
  ].map((key) => [key, scalar(frontmatter, key)]));
  const relativePath = wikiPathFrom(root, file) || path.basename(file);
  const lookupBases = new Set([
    configuredRoot,
    root,
    ...validationRoots,
    ...validationRoots.map((validationRoot) => path.dirname(validationRoot)),
  ]);
  const pathLookups = [...lookupBases]
    .map((base) => wikiPathFrom(base, file))
    .filter(Boolean);
  records.push({
    file,
    relativePath: relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`,
    stem,
    frontmatterFields,
    id: frontmatterFields.id || recordIdFromStem(stem),
    type: frontmatterFields.type,
    title: frontmatterFields.title,
    organization: frontmatterFields.organization,
    source: frontmatterFields.source,
    managedBy: frontmatterFields.managed_by,
    links: wikiLinks(content),
    pathLookups,
  });
}

const byId = new Map();
const byLookup = new Map();
for (const record of records) {
  const idKey = normalize(record.id);
  const duplicates = byId.get(idKey) ?? [];
  duplicates.push(record);
  byId.set(idKey, duplicates);
  for (const lookup of [record.id, record.stem, record.title, ...record.pathLookups]) {
    if (lookup) byLookup.set(normalize(lookup), record);
  }
}

const duplicateIds = [...byId.values()]
  .filter((duplicates) => duplicates.length > 1)
  .map((duplicates) => ({
    id: duplicates[0].id,
    paths: duplicates.map((record) => record.relativePath),
  }));

const seedFrontmatterFields = ["id", "type", "title", "organization", "source"];
const centralFrontmatterFields = [
  "id",
  "canonical_key",
  "type",
  "title",
  "organization_id",
  "organization_slug",
  "organization",
  "status",
  "confidence",
  "confidentiality",
  "updated_at",
  "managed_by",
  "provenance",
  "relations",
];
const missingFrontmatter = records.flatMap((record) => {
  const central = record.managedBy === CENTRAL_PROJECTOR;
  const required = central ? centralFrontmatterFields : seedFrontmatterFields;
  const missing = required.filter((key) => !present(record.frontmatterFields[key]));
  if (central && !validCentralProvenance(record.frontmatterFields.provenance)) missing.push("provenance");
  if (central && !validCentralRelations(record.frontmatterFields.relations)) missing.push("relations");
  if (central && !Number.isFinite(Number(record.frontmatterFields.confidence))) missing.push("confidence");
  const uniqueMissing = [...new Set(missing)];
  return uniqueMissing.length ? [{ path: record.relativePath, missing: uniqueMissing }] : [];
});

const brokenLinks = [];
const inbound = new Map(records.map((record) => [normalize(record.id), 0]));
for (const record of records) {
  for (const link of record.links) {
    const lookup = relationAliases.get(normalize(link)) ?? link;
    const target = byLookup.get(normalize(lookup));
    if (!target) {
      brokenLinks.push({ from: record.relativePath, target: link });
      continue;
    }
    const targetKey = normalize(target.id);
    inbound.set(targetKey, (inbound.get(targetKey) ?? 0) + 1);
  }
}

const orphanExemptions = new Set(["org-001", "index", "log", "manifest", "schema"]);
const orphans = records
  .filter((record) => (
    record.managedBy !== CENTRAL_PROJECTOR
    && !orphanExemptions.has(normalize(record.id))
    && (inbound.get(normalize(record.id)) ?? 0) === 0
    && record.links.length === 0
  ))
  .map((record) => record.relativePath);

const report = {
  root,
  roots: validationRoots,
  generatedAt: new Date().toISOString(),
  notes: records.length,
  links: records.reduce((total, record) => total + record.links.length, 0),
  duplicateIds,
  brokenLinks,
  missingFrontmatter,
  orphans,
  healthy: (
    duplicateIds.length === 0
    && brokenLinks.length === 0
    && missingFrontmatter.length === 0
    && orphans.length === 0
  ),
};

console.log(JSON.stringify(report, null, 2));
if (!report.healthy) process.exitCode = 1;
