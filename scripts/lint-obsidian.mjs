import { promises as fs } from "node:fs";
import path from "node:path";

const DEMO_ROOT = "OPS Demo — Atelier Beaumarchais";
const configuredVault = process.env.OBSIDIAN_VAULT_PATH;

if (!configuredVault) {
  console.error("OBSIDIAN_VAULT_PATH is required.");
  process.exit(2);
}

const configuredRoot = path.resolve(configuredVault);
const root = path.basename(configuredRoot) === DEMO_ROOT
  ? configuredRoot
  : path.join(configuredRoot, DEMO_ROOT);

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

function normalize(value) {
  return value
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

const files = await markdownFiles(root);
const records = [];

for (const file of files) {
  const content = await fs.readFile(file, "utf8");
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const stem = fileStem(file);
  records.push({
    file,
    relativePath: path.relative(root, file).split(path.sep).join("/"),
    stem,
    id: scalar(frontmatter, "id") || recordIdFromStem(stem),
    type: scalar(frontmatter, "type"),
    title: scalar(frontmatter, "title"),
    organization: scalar(frontmatter, "organization"),
    source: scalar(frontmatter, "source"),
    links: wikiLinks(content),
  });
}

const byId = new Map();
const byLookup = new Map();
for (const record of records) {
  const idKey = normalize(record.id);
  const duplicates = byId.get(idKey) ?? [];
  duplicates.push(record);
  byId.set(idKey, duplicates);
  for (const lookup of [record.id, record.stem, record.title]) {
    if (lookup) byLookup.set(normalize(lookup), record);
  }
}

const duplicateIds = [...byId.values()]
  .filter((duplicates) => duplicates.length > 1)
  .map((duplicates) => ({
    id: duplicates[0].id,
    paths: duplicates.map((record) => record.relativePath),
  }));

const missingFrontmatter = records
  .filter((record) => !record.id || !record.type || !record.title || !record.organization || !record.source)
  .map((record) => ({
    path: record.relativePath,
    missing: [
      !record.id && "id",
      !record.type && "type",
      !record.title && "title",
      !record.organization && "organization",
      !record.source && "source",
    ].filter(Boolean),
  }));

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
    !orphanExemptions.has(normalize(record.id))
    && (inbound.get(normalize(record.id)) ?? 0) === 0
    && record.links.length === 0
  ))
  .map((record) => record.relativePath);

const report = {
  root,
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
