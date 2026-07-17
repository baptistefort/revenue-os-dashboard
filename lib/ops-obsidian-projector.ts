import { promises as fs } from "node:fs";
import path from "node:path";
import {
  knowledgeStateDigest,
  type DurableKnowledgeNote,
  type KnowledgeAccess,
  type KnowledgeState,
} from "./ops-knowledge-pipeline";

interface ProjectionManifest {
  schemaVersion: 1;
  stateDigest: string;
  files: string[];
}

export interface ObsidianProjectionResult {
  root: string;
  stateDigest: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  deleted: string[];
}

const manifestName = ".ops-knowledge-manifest.json";

function yamlString(value: string) {
  return JSON.stringify(value);
}

function yamlList(values: string[]) {
  return `[${values.map(yamlString).join(", ")}]`;
}

function safeStem(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "note";
}

function assertRelativeFile(value: string) {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) {
    throw new Error(`Unsafe projection path: ${value}`);
  }
  return normalized;
}

function noteFile(note: DurableKnowledgeNote) {
  const directory = note.kind === "entity" ? "Knowledge/Entities" : "Knowledge/Topics";
  return `${directory}/${safeStem(note.title)}--${note.id}.md`;
}

function accessFrontmatter(access: KnowledgeAccess) {
  return [
    `confidentiality: ${access.confidentiality}`,
    `allowed_groups: ${yamlList(access.allowedGroups ?? [])}`,
    `contains_personal_data: ${Boolean(access.containsPersonalData)}`,
    `retention_until: ${access.retentionUntil ? yamlString(access.retentionUntil) : "null"}`,
  ].join("\n");
}

function renderNote(note: DurableKnowledgeNote) {
  const sources = note.provenance.map((source) => `${source.source}:${source.sourceRecordId}@${source.sourceVersion}`);
  const updatedAt = [...note.provenance].sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]?.observedAt;
  return `---
id: ${note.id}
type: durable_knowledge
note_kind: ${note.kind}
title: ${yamlString(note.title)}
topic: ${note.topic ? yamlString(note.topic) : "null"}
entity_ids: ${yamlList(note.entityIds)}
${accessFrontmatter(note.access)}
source_refs: ${yamlList(sources)}
updated_at: ${updatedAt ? yamlString(updatedAt) : "null"}
managed_by: ops-knowledge-projector
---

# ${note.title}

${note.summary}

${note.body ? `${note.body}\n\n` : ""}## Objets de connaissance

- Faits : ${yamlList(note.factIds)}
- Relations : ${yamlList(note.relationIds)}
- Engagements : ${yamlList(note.commitmentIds)}
- Décisions : ${yamlList(note.decisionIds)}
- Tâches : ${yamlList(note.taskIds)}
- Métriques : ${yamlList(note.metricIds)}

## Provenance

${note.provenance.map((source) => `- \`${source.source}:${source.sourceRecordId}@${source.sourceVersion}\` — observé ${source.observedAt}.`).join("\n") || "- Aucune source."}
`;
}

function renderIndex(state: KnowledgeState, notePaths: Map<string, string>) {
  const grouped = new Map<string, DurableKnowledgeNote[]>();
  for (const note of state.notes) {
    const values = grouped.get(note.kind) ?? [];
    values.push(note);
    grouped.set(note.kind, values);
  }
  const sections = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([kind, notes]) => (
    `## ${kind === "entity" ? "Entités" : "Sujets"}\n\n${notes
      .sort((left, right) => left.title.localeCompare(right.title))
      .map((note) => `- [[${notePaths.get(note.id)?.replace(/\.md$/, "")}|${note.title}]] — ${note.access.confidentiality}.`)
      .join("\n")}`
  ));
  return `---
id: OPS-KNOWLEDGE-INDEX
type: knowledge_index
title: "Index de connaissance OPS"
managed_by: ops-knowledge-projector
state_digest: ${knowledgeStateDigest(state)}
---

# Index de connaissance OPS

${state.entities.length} entités, ${state.facts.length} faits, ${state.relations.length} relations, ${state.metrics.length} métriques et ${state.notes.length} notes durables.

${sections.join("\n\n")}
`;
}

function renderJournal(state: KnowledgeState) {
  return `---
id: OPS-KNOWLEDGE-JOURNAL
type: append_only_journal
title: "Journal d’ingestion OPS"
managed_by: ops-knowledge-projector
---

# Journal d’ingestion OPS

${state.journal.map((entry) => `## ${entry.observedAt} — ${entry.action}\n\n- Événement : \`${entry.eventId}\`\n- Source : \`${entry.source}\`\n- Enregistrement : \`${entry.recordKey}\`\n- Version : \`${entry.sourceVersion}\``).join("\n\n") || "Aucun événement."}
`;
}

function renderProvenance(state: KnowledgeState) {
  const active = Object.values(state.contributions).sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  const tombstones = Object.entries(state.sourceClocks)
    .filter(([, clock]) => clock.deleted)
    .sort(([left], [right]) => left.localeCompare(right));
  return `---
id: OPS-KNOWLEDGE-PROVENANCE
type: provenance_ledger
title: "Registre de provenance OPS"
managed_by: ops-knowledge-projector
---

# Registre de provenance OPS

## Sources actives

${active.map(({ recordKey, event }) => `- \`${recordKey}\` — version \`${event.sourceVersion}\`, observée ${event.observedAt}, confidentialité ${event.access.confidentiality}.`).join("\n") || "- Aucune."}

## Tombstones

${tombstones.map(([key, clock]) => `- \`${key}\` — supprimé par \`${clock.eventId}\` à ${clock.observedAt}, version \`${clock.sourceVersion}\`.`).join("\n") || "- Aucun."}
`;
}

async function readManifest(root: string): Promise<ProjectionManifest | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(root, manifestName), "utf8")) as ProjectionManifest;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.files)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeIfChanged(root: string, relative: string, content: string, result: ObsidianProjectionResult) {
  const safeRelative = assertRelativeFile(relative);
  const target = path.join(root, safeRelative);
  let existing: string | undefined;
  try {
    existing = await fs.readFile(target, "utf8");
  } catch {
    existing = undefined;
  }
  if (existing === content) {
    result.unchanged.push(safeRelative);
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o660 });
  await fs.rename(temporary, target);
  (existing === undefined ? result.created : result.updated).push(safeRelative);
}

export async function projectKnowledgeToObsidian(
  state: KnowledgeState,
  targetDirectory: string,
): Promise<ObsidianProjectionResult> {
  const root = path.resolve(targetDirectory);
  if (root === path.parse(root).root) throw new Error("Refusing to project knowledge into a filesystem root.");
  await fs.mkdir(root, { recursive: true });
  const previousManifest = await readManifest(root);
  const notePaths = new Map(state.notes.map((note) => [note.id, noteFile(note)]));
  const files = new Map<string, string>();
  for (const note of state.notes) files.set(notePaths.get(note.id)!, renderNote(note));
  files.set("System/Knowledge-Index.md", renderIndex(state, notePaths));
  files.set("System/Journal.md", renderJournal(state));
  files.set("System/Provenance.md", renderProvenance(state));

  const result: ObsidianProjectionResult = {
    root,
    stateDigest: knowledgeStateDigest(state),
    created: [],
    updated: [],
    unchanged: [],
    deleted: [],
  };

  for (const [relative, content] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    await writeIfChanged(root, relative, content, result);
  }

  const currentFiles = new Set(files.keys());
  for (const relative of previousManifest?.files ?? []) {
    const safeRelative = assertRelativeFile(relative);
    if (currentFiles.has(safeRelative)) continue;
    try {
      await fs.unlink(path.join(root, safeRelative));
      result.deleted.push(safeRelative);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const manifest: ProjectionManifest = {
    schemaVersion: 1,
    stateDigest: result.stateDigest,
    files: [...files.keys()].sort(),
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = path.join(root, manifestName);
  let currentManifest = "";
  try {
    currentManifest = await fs.readFile(manifestPath, "utf8");
  } catch {
    currentManifest = "";
  }
  if (currentManifest !== manifestContent) {
    const temporary = `${manifestPath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, manifestContent, { encoding: "utf8", mode: 0o660 });
    await fs.rename(temporary, manifestPath);
  }

  return result;
}
