import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SqlQueryable } from "./database";
import { getCentralMemoryPool } from "./database";
import { resolveCentralMemoryOrganization } from "./search";

const MANAGED_DIRECTORY = "Central";
const MANIFEST_NAME = ".ops-central-memory-manifest.json";
const PROJECTOR_NAME = "ops-central-memory-projector";
const MANIFEST_SCHEMA_VERSION = 1;
const TRANSIENT_ENTITY_TYPES = new Set(["email-message"]);
const SENSITIVE_ATTRIBUTE_PATTERN = /(?:api.?key|authorization|cookie|credential|password|private.?key|secret|session|token)/i;

type JsonObject = Record<string, unknown>;

type ProjectionEntityRow = {
  id: string;
  canonical_key: string;
  entity_type: string;
  display_name: string;
  summary: string | null;
  attributes: JsonObject | null;
  confidence: number | string;
  status: string;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  source_type: string | null;
  source_id: string | null;
  source_version: number | string | null;
  source_updated_at: Date | string | null;
};

type ProjectionRelationRow = {
  id: string;
  subject_id: string;
  subject_key: string;
  subject_name: string;
  predicate: string;
  object_id: string;
  object_key: string;
  object_name: string;
  confidence: number | string;
  properties: JsonObject | null;
  observed_at: Date | string;
};

type ProjectionManifest = {
  schemaVersion: 1;
  projector: typeof PROJECTOR_NAME;
  organizationId: string;
  organizationSlug: string;
  files: string[];
};

export type CentralObsidianProjectionResult = {
  organizationId: string;
  organizationSlug: string;
  root: string;
  entities: number;
  relations: number;
  excludedTransientEntities: number;
  created: string[];
  updated: string[];
  unchanged: string[];
  deleted: string[];
};

export type CentralObsidianProjectionOptions = {
  vaultRoot: string;
  queryable?: SqlQueryable;
  organizationSlug?: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function asIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function yamlScalar(value: string | number | boolean | null) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function safeStem(value: string, maximum = 72) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximum) || "element";
}

function safeWikiLabel(value: string) {
  return value.replace(/[\[\]|\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function safePredicate(value: string) {
  return value.replace(/[`\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function entityDirectory(entityType: string) {
  const mapped: Record<string, string> = {
    organization: "Entreprise",
    "team-member": "Equipe",
    client: "Clients",
    contact: "Personnes",
    opportunity: "Opportunites",
    project: "Projets",
    invoice: "Finance",
    payment: "Finance",
    "email-thread": "Emails",
    meeting: "Reunions",
    decision: "Decisions",
    task: "Taches",
    document: "Documents",
    commitment: "Engagements",
  };
  return mapped[entityType] ?? `Autres/${safeStem(entityType, 48)}`;
}

function entityFile(entity: ProjectionEntityRow) {
  const identity = `${entity.entity_type}:${entity.canonical_key}`;
  const stem = `${safeStem(entity.display_name)}--${safeStem(entity.canonical_key, 42)}-${sha256(identity).slice(0, 8)}`;
  return `${entityDirectory(entity.entity_type)}/${stem}.md`;
}

function normalizeRelativeFile(value: string) {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (
    !normalized
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe managed projection path: ${value}`);
  }
  return normalized;
}

function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function managedTarget(root: string, relative: string) {
  const safeRelative = normalizeRelativeFile(relative);
  const target = path.resolve(root, ...safeRelative.split("/"));
  if (!inside(root, target)) throw new Error(`Managed projection path escapes its root: ${relative}`);
  return { relative: safeRelative, target };
}

async function ensureSafeDirectory(root: string, directory: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedDirectory = path.resolve(directory);
  if (!inside(resolvedRoot, resolvedDirectory)) {
    throw new Error(`Managed projection directory escapes its root: ${directory}`);
  }
  const relative = path.relative(resolvedRoot, resolvedDirectory);
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stats = await fs.lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`Unsafe managed projection directory: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await fs.mkdir(current);
      const stats = await fs.lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`Unsafe managed projection directory: ${current}`);
      }
    }
  }
}

function usefulAttributes(attributes: JsonObject | null) {
  if (!attributes) return [];
  return Object.entries(attributes)
    .filter(([key, value]) => (
      !SENSITIVE_ATTRIBUTE_PATTERN.test(key)
      && key !== "trace"
      && key !== "tenantId"
      && key !== "id"
      && value !== undefined
      && value !== null
      && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        || (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))))
    ))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 24)
    .map(([key, value]) => [key, value] as const);
}

function confidentiality(attributes: JsonObject | null) {
  const raw = attributes?.confidentiality;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 80) : "interne";
}

function wikiTarget(relativePath: string) {
  return `${MANAGED_DIRECTORY}/${relativePath.replace(/\.md$/i, "")}`;
}

function renderEntityNote(options: {
  entity: ProjectionEntityRow;
  organization: { id: string; slug: string; display_name: string };
  paths: Map<string, string>;
  relations: ProjectionRelationRow[];
}) {
  const { entity, organization, paths } = options;
  const relationLines: string[] = [];
  const relationLinks: string[] = [];
  for (const relation of options.relations) {
    const outgoing = relation.subject_id === entity.id;
    const otherId = outgoing ? relation.object_id : relation.subject_id;
    const otherName = outgoing ? relation.object_name : relation.subject_name;
    const otherPath = paths.get(otherId);
    if (!otherPath) continue;
    const link = `[[${wikiTarget(otherPath)}|${safeWikiLabel(otherName)}]]`;
    relationLinks.push(link);
    const predicate = safePredicate(relation.predicate);
    relationLines.push(outgoing
      ? `- \`${predicate}\` → ${link}`
      : `- ${link} → \`${predicate}\` → cette note`);
  }
  const uniqueLinks = [...new Set(relationLinks)].sort();
  const uniqueLines = [...new Set(relationLines)].sort((left, right) => left.localeCompare(right));
  const attributes = usefulAttributes(entity.attributes);
  const sourceUpdatedAt = asIso(entity.source_updated_at);
  const lastSeenAt = asIso(entity.last_seen_at);
  const parsedSourceVersion = entity.source_version === null ? Number.NaN : Number(entity.source_version);
  const provenance = {
    source_type: entity.source_type ?? "central-memory",
    source_id: entity.source_id ?? entity.canonical_key,
    source_version: Number.isFinite(parsedSourceVersion) ? parsedSourceVersion : null,
    source_updated_at: sourceUpdatedAt,
  };

  return `---
id: ${yamlScalar(entity.id)}
canonical_key: ${yamlScalar(entity.canonical_key)}
type: ${yamlScalar(entity.entity_type)}
title: ${yamlScalar(entity.display_name)}
organization_id: ${yamlScalar(organization.id)}
organization_slug: ${yamlScalar(organization.slug)}
organization: ${yamlScalar(organization.display_name)}
status: ${yamlScalar(entity.status)}
confidence: ${Number(entity.confidence) || 0}
confidentiality: ${yamlScalar(confidentiality(entity.attributes))}
updated_at: ${yamlScalar(lastSeenAt)}
managed_by: ${PROJECTOR_NAME}
provenance: ${JSON.stringify(provenance)}
relations: ${JSON.stringify(uniqueLinks)}
${attributes.length ? `attributes:\n${attributes.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join("\n")}\n` : ""}---

# ${safeWikiLabel(entity.display_name)}

${entity.summary?.trim() || "Cette connaissance est maintenue par la mémoire centrale OPS."}

## Relations

${uniqueLines.join("\n") || "- Aucune relation active."}

## Provenance

- Source : \`${provenance.source_type}\`
- Identifiant source : \`${String(provenance.source_id).replace(/`/g, "")}\`
- Version source : ${provenance.source_version ?? "non renseignée"}
- Dernière observation : ${sourceUpdatedAt ?? lastSeenAt ?? "non renseignée"}
`;
}

async function readManifest(root: string): Promise<ProjectionManifest | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(root, MANIFEST_NAME), "utf8")) as Partial<ProjectionManifest>;
    if (
      parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION
      || parsed.projector !== PROJECTOR_NAME
      || !Array.isArray(parsed.files)
      || typeof parsed.organizationId !== "string"
      || typeof parsed.organizationSlug !== "string"
    ) return null;
    return parsed as ProjectionManifest;
  } catch {
    return null;
  }
}

async function atomicWrite(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o660 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function writeIfChanged(
  root: string,
  relative: string,
  content: string,
  result: CentralObsidianProjectionResult,
) {
  const safe = managedTarget(root, relative);
  let current: string | null = null;
  try {
    current = await fs.readFile(safe.target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current === content) {
    result.unchanged.push(safe.relative);
    return;
  }
  if (current !== null && !current.includes(`managed_by: ${PROJECTOR_NAME}`)) {
    throw new Error(`Refusing to overwrite an unmanaged Obsidian note: ${safe.relative}`);
  }
  await ensureSafeDirectory(root, path.dirname(safe.target));
  await atomicWrite(safe.target, content);
  (current === null ? result.created : result.updated).push(safe.relative);
}

async function isManagedProjectionFile(file: string) {
  try {
    const handle = await fs.open(file, "r");
    try {
      const buffer = Buffer.alloc(4_096);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return buffer.subarray(0, bytesRead).toString("utf8").includes(`managed_by: ${PROJECTOR_NAME}`);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function fetchEntities(queryable: SqlQueryable, organizationId: string) {
  return queryable.query<ProjectionEntityRow>(`
    SELECT
      entities.id,
      entities.canonical_key,
      entities.entity_type,
      entities.display_name,
      entities.summary,
      entities.attributes,
      entities.confidence,
      entities.status,
      entities.first_seen_at,
      entities.last_seen_at,
      COALESCE(source_objects.source_type, source_events.source_type) AS source_type,
      COALESCE(source_objects.source_id, source_events.source_id) AS source_id,
      source_objects.version AS source_version,
      COALESCE(source_objects.source_updated_at, source_events.occurred_at, entities.last_seen_at) AS source_updated_at
    FROM ops_memory.entities
    LEFT JOIN ops_memory.source_objects ON source_objects.id = entities.source_object_id
    LEFT JOIN ops_memory.source_events ON source_events.id = entities.source_event_id
    WHERE entities.organization_id = $1
      AND entities.deleted_at IS NULL
    ORDER BY entities.entity_type, entities.canonical_key
  `, [organizationId]);
}

async function fetchRelations(queryable: SqlQueryable, organizationId: string, entityIds: string[]) {
  if (!entityIds.length) return { rows: [] as ProjectionRelationRow[] };
  return queryable.query<ProjectionRelationRow>(`
    SELECT
      relations.id,
      subject.id AS subject_id,
      subject.canonical_key AS subject_key,
      subject.display_name AS subject_name,
      relations.predicate,
      object.id AS object_id,
      object.canonical_key AS object_key,
      object.display_name AS object_name,
      relations.confidence,
      relations.properties,
      relations.observed_at
    FROM ops_memory.relations
    JOIN ops_memory.entities subject ON subject.id = relations.subject_entity_id
    JOIN ops_memory.entities object ON object.id = relations.object_entity_id
    WHERE relations.organization_id = $1
      AND relations.deleted_at IS NULL
      AND subject.deleted_at IS NULL
      AND object.deleted_at IS NULL
      AND subject.id = ANY($2::uuid[])
      AND object.id = ANY($2::uuid[])
    ORDER BY subject.canonical_key, relations.predicate, object.canonical_key
  `, [organizationId, entityIds]);
}

export async function projectCentralMemoryToObsidian(
  options: CentralObsidianProjectionOptions,
): Promise<CentralObsidianProjectionResult> {
  const requestedVaultRoot = path.resolve(options.vaultRoot);
  if (requestedVaultRoot === path.parse(requestedVaultRoot).root) {
    throw new Error("Refusing to project central memory into a filesystem root.");
  }
  await fs.mkdir(requestedVaultRoot, { recursive: true });
  const vaultRoot = await fs.realpath(requestedVaultRoot);
  if (vaultRoot === path.parse(vaultRoot).root) {
    throw new Error("Refusing to project central memory into a filesystem root.");
  }
  const managedRoot = path.resolve(vaultRoot, MANAGED_DIRECTORY);
  if (!inside(vaultRoot, managedRoot) || managedRoot === vaultRoot) {
    throw new Error("Invalid Obsidian central-memory projection root.");
  }
  await ensureSafeDirectory(vaultRoot, managedRoot);

  const queryable = options.queryable ?? getCentralMemoryPool();
  const organization = await resolveCentralMemoryOrganization(queryable, options.organizationSlug);
  if (!organization) throw new Error("Central memory organization was not found.");

  const entityResult = await fetchEntities(queryable, organization.id);
  const excludedTransientEntities = entityResult.rows.filter((entity) => TRANSIENT_ENTITY_TYPES.has(entity.entity_type)).length;
  const entities = entityResult.rows.filter((entity) => !TRANSIENT_ENTITY_TYPES.has(entity.entity_type));
  if (!entities.length) {
    throw new Error("Central memory contains no durable entity to project.");
  }
  const entityIds = new Set(entities.map((entity) => entity.id));
  const relationResult = await fetchRelations(queryable, organization.id, [...entityIds]);
  const relations = relationResult.rows.filter((relation) => (
    entityIds.has(relation.subject_id) && entityIds.has(relation.object_id)
  ));
  const paths = new Map(entities.map((entity) => [entity.id, entityFile(entity)]));
  const relationsByEntity = new Map<string, ProjectionRelationRow[]>();
  for (const relation of relations) {
    for (const entityId of [relation.subject_id, relation.object_id]) {
      const values = relationsByEntity.get(entityId) ?? [];
      values.push(relation);
      relationsByEntity.set(entityId, values);
    }
  }
  const files = new Map<string, string>();
  for (const entity of entities) {
    files.set(paths.get(entity.id)!, renderEntityNote({
      entity,
      organization,
      paths,
      relations: relationsByEntity.get(entity.id) ?? [],
    }));
  }

  const result: CentralObsidianProjectionResult = {
    organizationId: organization.id,
    organizationSlug: organization.slug,
    root: managedRoot,
    entities: entities.length,
    relations: relations.length,
    excludedTransientEntities,
    created: [],
    updated: [],
    unchanged: [],
    deleted: [],
  };
  const previousManifest = await readManifest(managedRoot);
  for (const [relative, content] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    await writeIfChanged(managedRoot, relative, content, result);
  }

  const currentFiles = new Set(files.keys());
  if (previousManifest?.organizationId === organization.id) {
    for (const previousFile of previousManifest.files) {
      const safe = managedTarget(managedRoot, previousFile);
      if (currentFiles.has(safe.relative)) continue;
      if (!await isManagedProjectionFile(safe.target)) continue;
      try {
        await fs.unlink(safe.target);
        result.deleted.push(safe.relative);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  const manifest: ProjectionManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    projector: PROJECTOR_NAME,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    files: [...files.keys()].sort(),
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = path.join(managedRoot, MANIFEST_NAME);
  let existingManifest = "";
  try {
    existingManifest = await fs.readFile(manifestPath, "utf8");
  } catch {
    existingManifest = "";
  }
  if (existingManifest !== manifestContent) await atomicWrite(manifestPath, manifestContent);
  return result;
}
