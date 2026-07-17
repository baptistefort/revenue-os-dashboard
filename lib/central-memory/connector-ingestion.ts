import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  CentralMemoryPool,
  SqlQueryable,
  TransactionClient,
} from "@/lib/central-memory/database";
import { CentralMemoryRepository } from "@/lib/central-memory/repository";
import {
  applyKnowledgeEvents,
  createKnowledgeState,
  type Confidentiality,
  type EntityIdentifierInput,
  type KnowledgeAccess,
  type KnowledgeEvent,
  type KnowledgePayload,
  type KnowledgeSource,
  type JsonValue,
} from "@/lib/ops-knowledge-pipeline";

const MAX_EVENT_BYTES = 2 * 1024 * 1024;

export const CONNECTOR_SOURCES = [
  "gmail",
  "notion",
  "slack",
  "teams",
  "google-drive",
  "google-calendar",
  "twenty",
  "crm",
  "google-search-console",
  "seo",
  "google-ads",
  "meta-ads",
  "instagram-ads",
  "linkedin-ads",
  "ads",
  "pennylane",
  "stripe",
  "banking",
  "finance",
] as const;

export type ConnectorSource = typeof CONNECTOR_SOURCES[number];

const confidentialitySchema = z.enum(["public", "internal", "confidential", "restricted"]);
const accessSchema = z.object({
  confidentiality: confidentialitySchema.default("internal"),
  allowedGroups: z.array(z.string().trim().min(1).max(128)).max(64).default([]),
  containsPersonalData: z.boolean().default(false),
  retentionUntil: z.iso.datetime({ offset: true }).optional(),
}).strict();

const identifierSchema = z.object({
  scheme: z.enum(["email", "domain", "siret", "phone", "url", "external"]),
  value: z.string().trim().min(1).max(1_024),
}).strict();

const entitySchema = z.object({
  ref: z.string().trim().min(1).max(256),
  kind: z.enum(["organization", "person", "project", "document", "channel"]),
  name: z.string().trim().min(1).max(512),
  identifiers: z.array(identifierSchema).max(64).optional(),
  aliases: z.array(z.string().trim().min(1).max(512)).max(64).optional(),
  attributes: z.record(z.string(), z.json()).optional(),
}).strict();

const accessOverride = z.object({
  confidentiality: confidentialitySchema.optional(),
  allowedGroups: z.array(z.string().trim().min(1).max(128)).max(64).optional(),
  containsPersonalData: z.boolean().optional(),
  retentionUntil: z.iso.datetime({ offset: true }).optional(),
}).strict().optional();

const payloadSchema = z.object({
  entities: z.array(entitySchema).min(1).max(1_000),
  facts: z.array(z.object({
    key: z.string().trim().min(1).max(512).optional(),
    subjectRef: z.string().trim().min(1).max(256),
    predicate: z.string().trim().min(1).max(256),
    value: z.json(),
    validAt: z.iso.datetime({ offset: true }).optional(),
    confidence: z.number().min(0).max(1).optional(),
    access: accessOverride,
  }).strict()).max(5_000).optional(),
  relations: z.array(z.object({
    fromRef: z.string().trim().min(1).max(256),
    toRef: z.string().trim().min(1).max(256),
    type: z.string().trim().min(1).max(256),
    confidence: z.number().min(0).max(1).optional(),
    access: accessOverride,
  }).strict()).max(5_000).optional(),
  commitments: z.array(z.object({
    key: z.string().trim().min(1).max(512).optional(),
    ownerRef: z.string().trim().min(1).max(256),
    beneficiaryRef: z.string().trim().min(1).max(256).optional(),
    action: z.string().trim().min(1).max(8_000),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(["open", "done", "cancelled"]).optional(),
    access: accessOverride,
  }).strict()).max(2_000).optional(),
  decisions: z.array(z.object({
    key: z.string().trim().min(1).max(512).optional(),
    subjectRef: z.string().trim().min(1).max(256),
    decision: z.string().trim().min(1).max(16_000),
    decidedByRef: z.string().trim().min(1).max(256).optional(),
    decidedAt: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(["proposed", "approved", "rejected", "superseded"]).optional(),
    access: accessOverride,
  }).strict()).max(2_000).optional(),
  tasks: z.array(z.object({
    key: z.string().trim().min(1).max(512).optional(),
    subjectRef: z.string().trim().min(1).max(256),
    title: z.string().trim().min(1).max(2_000),
    ownerRef: z.string().trim().min(1).max(256).optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
    access: accessOverride,
  }).strict()).max(2_000).optional(),
  metrics: z.array(z.object({
    key: z.string().trim().min(1).max(512).optional(),
    subjectRef: z.string().trim().min(1).max(256),
    name: z.string().trim().min(1).max(512),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(128),
    periodStart: z.iso.datetime({ offset: true }).optional(),
    periodEnd: z.iso.datetime({ offset: true }).optional(),
    access: accessOverride,
  }).strict()).max(5_000).optional(),
  notes: z.array(z.object({
    key: z.string().trim().min(1).max(512),
    title: z.string().trim().min(1).max(1_000),
    summary: z.string().trim().min(1).max(8_000),
    body: z.string().max(250_000).optional(),
    entityRefs: z.array(z.string().trim().min(1).max(256)).max(1_000).optional(),
    topic: z.string().trim().min(1).max(256).optional(),
    access: accessOverride,
  }).strict()).max(1_000).optional(),
}).strict();

const sourceObjectSchema = z.object({
  objectType: z.string().trim().min(1).max(256),
  title: z.string().trim().max(2_000).optional(),
  contentText: z.string().max(1_000_000).optional(),
  content: z.record(z.string(), z.json()).optional(),
  metadata: z.record(z.string(), z.json()).optional(),
  sourceUrl: z.url().max(8_000).optional(),
  mimeType: z.string().trim().min(1).max(256).optional(),
  sourceCreatedAt: z.iso.datetime({ offset: true }).optional(),
  sourceUpdatedAt: z.iso.datetime({ offset: true }).optional(),
}).strict();

const connectorKnowledgeEventSchema = z.object({
  eventId: z.string().trim().min(1).max(512),
  tenantId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  source: z.enum(CONNECTOR_SOURCES),
  sourceAccountId: z.string().trim().min(1).max(512).default("default"),
  sourceRecordId: z.string().trim().min(1).max(512),
  sourceVersion: z.string().trim().min(1).max(128),
  operation: z.enum(["upsert", "delete"]),
  observedAt: z.iso.datetime({ offset: true }),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  access: accessSchema,
  sourceObject: sourceObjectSchema.optional(),
  payload: payloadSchema.optional(),
}).strict().superRefine((event, context) => {
  if (event.operation === "upsert" && !event.payload) {
    context.addIssue({ code: "custom", path: ["payload"], message: "payload is required for upsert" });
  }
  if (event.operation === "upsert" && !event.sourceObject) {
    context.addIssue({ code: "custom", path: ["sourceObject"], message: "sourceObject is required for upsert" });
  }
});

export type ConnectorKnowledgeEvent = z.infer<typeof connectorKnowledgeEventSchema>;

export type IngestionCounts = {
  entities: number;
  relations: number;
  facts: number;
  metrics: number;
  commitments: number;
  decisions: number;
  tasks: number;
  notes: number;
  softDeleted: number;
};

export type ConnectorIngestionResult = {
  eventId: string;
  sourceEventId: string;
  sourceObjectId: string | null;
  duplicate: boolean;
  stale: boolean;
  processingState: "processed" | "ignored";
  counts: IngestionCounts;
};

type IngestionActor = {
  actorId: string;
  requestId?: string;
  correlationId?: string;
};

type Environment = Record<string, string | undefined> & {
  OPS_INGESTION_TOKEN?: string;
  OPS_INGESTION_TOKENS_JSON?: string;
  OPS_ORGANIZATION_SLUG?: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export type IngestionAuthorization =
  | { authorized: true; tenantId: string }
  | { authorized: false; reason: "missing" | "invalid" | "unconfigured" | "tenant_not_allowed" };

export function authorizeConnectorIngestion(
  authorization: string | null,
  tenantId: string,
  env: Environment = process.env,
): IngestionAuthorization {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { authorized: false, reason: "missing" };

  if (env.OPS_INGESTION_TOKENS_JSON?.trim()) {
    let tokens: Record<string, unknown>;
    try {
      tokens = JSON.parse(env.OPS_INGESTION_TOKENS_JSON) as Record<string, unknown>;
    } catch {
      return { authorized: false, reason: "unconfigured" };
    }
    const expected = tokens[tenantId];
    if (typeof expected !== "string" || !expected.trim()) {
      return { authorized: false, reason: "tenant_not_allowed" };
    }
    return safeEqual(token, expected)
      ? { authorized: true, tenantId }
      : { authorized: false, reason: "invalid" };
  }

  const expected = env.OPS_INGESTION_TOKEN?.trim();
  if (!expected) return { authorized: false, reason: "unconfigured" };
  const allowedTenant = env.OPS_ORGANIZATION_SLUG?.trim() || "atelier-beaumarchais";
  if (tenantId !== allowedTenant) return { authorized: false, reason: "tenant_not_allowed" };
  return safeEqual(token, expected)
    ? { authorized: true, tenantId }
    : { authorized: false, reason: "invalid" };
}

export function parseConnectorKnowledgeEvent(value: unknown): ConnectorKnowledgeEvent {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES) {
    throw new Error("connector_event_too_large");
  }
  const event = connectorKnowledgeEventSchema.parse(value);
  validateReferences(event.payload);
  return event;
}

function validateReferences(payload: KnowledgePayload | undefined) {
  if (!payload) return;
  const refs = new Set(payload.entities.map((entity) => entity.ref));
  if (refs.size !== payload.entities.length) throw new Error("duplicate_entity_ref");
  const required = [
    ...(payload.facts ?? []).map((item) => item.subjectRef),
    ...(payload.relations ?? []).flatMap((item) => [item.fromRef, item.toRef]),
    ...(payload.commitments ?? []).flatMap((item) => [item.ownerRef, item.beneficiaryRef].filter(Boolean) as string[]),
    ...(payload.decisions ?? []).flatMap((item) => [item.subjectRef, item.decidedByRef].filter(Boolean) as string[]),
    ...(payload.tasks ?? []).flatMap((item) => [item.subjectRef, item.ownerRef].filter(Boolean) as string[]),
    ...(payload.metrics ?? []).map((item) => item.subjectRef),
    ...(payload.notes ?? []).flatMap((item) => item.entityRefs ?? []),
  ];
  const missing = [...new Set(required.filter((ref) => !refs.has(ref)))];
  if (missing.length) throw new Error(`unknown_entity_ref:${missing.join(",")}`);
}

function knowledgeSource(source: ConnectorSource): KnowledgeSource {
  if (source === "gmail") return "email";
  if (source === "twenty") return "crm";
  if (source === "google-drive") return "drive";
  if (source === "google-calendar") return "calendar";
  if (source === "google-search-console") return "seo";
  if (["google-ads", "meta-ads", "instagram-ads", "linkedin-ads"].includes(source)) return "ads";
  if (["pennylane", "stripe", "banking"].includes(source)) return "finance";
  return source as KnowledgeSource;
}

function compileEvent(event: ConnectorKnowledgeEvent) {
  const knowledgeEvent: KnowledgeEvent = {
    eventId: event.eventId,
    tenantId: event.tenantId,
    source: knowledgeSource(event.source),
    sourceRecordId: event.sourceRecordId,
    sourceVersion: event.sourceVersion,
    operation: event.operation,
    observedAt: event.observedAt,
    occurredAt: event.occurredAt,
    access: event.access as KnowledgeAccess,
    payload: event.payload as KnowledgePayload | undefined,
  };
  return applyKnowledgeEvents(createKnowledgeState(event.tenantId), [knowledgeEvent]);
}

function normalizeIdentifier(identifier: EntityIdentifierInput) {
  let value = identifier.value.trim();
  if (["email", "domain", "url"].includes(identifier.scheme)) value = value.toLowerCase();
  if (identifier.scheme === "domain") value = value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (["phone", "siret"].includes(identifier.scheme)) value = value.replace(/[^0-9+]/g, "");
  return `${identifier.scheme}:${value}`;
}

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function accessValues(access: KnowledgeAccess) {
  return [
    access.confidentiality,
    access.allowedGroups ?? [],
    access.containsPersonalData ?? false,
    access.retentionUntil ? new Date(access.retentionUntil) : null,
  ] as const;
}

function itemAccess(item: { access: KnowledgeAccess }) {
  return accessValues(item.access);
}

async function insertEvidence(
  client: SqlQueryable,
  input: {
    organizationId: string;
    resourceType: string;
    resourceId: string;
    evidenceKey: string;
    sourceEventId: string;
    sourceObjectId: string | null;
    observedAt: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(`
    INSERT INTO ops_memory.knowledge_evidence (
      organization_id, resource_type, resource_id, evidence_key,
      source_event_id, source_object_id, observed_at, confidence, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    ON CONFLICT (organization_id, resource_type, resource_id, source_event_id, evidence_key)
      WHERE deleted_at IS NULL
    DO UPDATE SET
      source_object_id = EXCLUDED.source_object_id,
      observed_at = EXCLUDED.observed_at,
      confidence = EXCLUDED.confidence,
      metadata = ops_memory.knowledge_evidence.metadata || EXCLUDED.metadata
  `, [
    input.organizationId,
    input.resourceType,
    input.resourceId,
    input.evidenceKey,
    input.sourceEventId,
    input.sourceObjectId,
    input.observedAt,
    input.confidence ?? 1,
    stableJson(input.metadata ?? {}),
  ]);
}

async function appendAudit(
  client: SqlQueryable,
  input: {
    organizationId: string;
    actor: IngestionActor;
    action: string;
    resourceType: string;
    resourceId: string;
    sourceEventId: string;
    afterState?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(`
    INSERT INTO ops_memory.audit_logs (
      organization_id, actor_type, actor_id, action, resource_type, resource_id,
      request_id, correlation_id, source_event_id, after_state, metadata
    ) VALUES ($1, 'connector', $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
  `, [
    input.organizationId,
    input.actor.actorId,
    input.action,
    input.resourceType,
    input.resourceId,
    input.actor.requestId ?? null,
    input.actor.correlationId ?? null,
    input.sourceEventId,
    input.afterState ? stableJson(input.afterState) : null,
    stableJson(input.metadata ?? {}),
  ]);
}

async function resolveOrganization(pool: SqlQueryable, slug: string) {
  const result = await pool.query<{ id: string; slug: string }>(`
    SELECT id, slug FROM ops_memory.organizations
    WHERE slug = $1 AND deleted_at IS NULL
  `, [slug]);
  if (!result.rows[0]) throw new Error("organization_not_found");
  return result.rows[0];
}

async function upsertCompiledEntity(
  client: SqlQueryable,
  input: {
    organizationId: string;
    entity: ReturnType<typeof compileEvent>["entities"][number];
    sourceEventId: string;
    sourceObjectId: string | null;
    observedAt: string;
  },
) {
  const keys = input.entity.identifiers.map(normalizeIdentifier);
  const canonicalKey = keys[0] ?? `name:${input.entity.kind}:${normalizeName(input.entity.displayName)}`;
  const entityType = input.entity.kind === "organization" ? "company" : input.entity.kind;
  const [confidentiality, allowedGroups, containsPersonalData, retentionUntil] = accessValues(input.entity.access);
  const existing = keys.length
    ? await client.query<{ id: string }>(`
        SELECT entity.id
        FROM ops_memory.entity_aliases alias
        JOIN ops_memory.entities entity ON entity.id = alias.entity_id
        WHERE alias.organization_id = $1
          AND alias.alias_type = 'identifier'
          AND alias.normalized_value = ANY($2::text[])
          AND alias.deleted_at IS NULL
          AND entity.deleted_at IS NULL
          AND entity.entity_type = $3
        ORDER BY alias.confidence DESC, entity.created_at
        LIMIT 1
      `, [input.organizationId, keys, entityType])
    : { rows: [] as Array<{ id: string }> };

  const attributes = {
    ...input.entity.attributes,
    aliases: input.entity.aliases,
    identifiers: input.entity.identifiers,
  };
  let row: { id: string } | undefined;
  if (existing.rows[0]) {
    const updated = await client.query<{ id: string }>(`
      UPDATE ops_memory.entities SET
        display_name = $3,
        attributes = attributes || $4::jsonb,
        confidence = GREATEST(confidence, $5),
        source_event_id = $6,
        source_object_id = $7,
        last_seen_at = GREATEST(last_seen_at, $8),
        confidentiality = $9,
        allowed_groups = $10,
        contains_personal_data = $11,
        retention_until = $12
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING id
    `, [
      existing.rows[0].id,
      input.organizationId,
      input.entity.displayName,
      stableJson(attributes),
      1,
      input.sourceEventId,
      input.sourceObjectId,
      input.observedAt,
      confidentiality,
      allowedGroups,
      containsPersonalData,
      retentionUntil,
    ]);
    row = updated.rows[0];
  } else {
    const upserted = await client.query<{ id: string }>(`
      INSERT INTO ops_memory.entities (
        organization_id, entity_type, canonical_key, display_name, attributes,
        source_event_id, source_object_id, first_seen_at, last_seen_at,
        confidentiality, allowed_groups, contains_personal_data, retention_until
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8, $9, $10, $11, $12)
      ON CONFLICT (organization_id, entity_type, canonical_key) WHERE deleted_at IS NULL
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        attributes = ops_memory.entities.attributes || EXCLUDED.attributes,
        source_event_id = EXCLUDED.source_event_id,
        source_object_id = EXCLUDED.source_object_id,
        last_seen_at = GREATEST(ops_memory.entities.last_seen_at, EXCLUDED.last_seen_at),
        confidentiality = EXCLUDED.confidentiality,
        allowed_groups = EXCLUDED.allowed_groups,
        contains_personal_data = EXCLUDED.contains_personal_data,
        retention_until = EXCLUDED.retention_until
      RETURNING id
    `, [
      input.organizationId,
      entityType,
      canonicalKey,
      input.entity.displayName,
      stableJson(attributes),
      input.sourceEventId,
      input.sourceObjectId,
      input.observedAt,
      confidentiality,
      allowedGroups,
      containsPersonalData,
      retentionUntil,
    ]);
    row = upserted.rows[0];
  }
  if (!row) throw new Error("entity_upsert_failed");

  const aliases = [
    ...keys.map((value) => ({ type: "identifier", value, display: value })),
    ...input.entity.aliases.map((value) => ({ type: "name", value: normalizeName(value), display: value })),
  ];
  for (const alias of aliases) {
    if (!alias.value) continue;
    await client.query(`
      INSERT INTO ops_memory.entity_aliases (
        organization_id, entity_id, alias_type, normalized_value, display_value,
        source_object_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (organization_id, alias_type, normalized_value, entity_id)
        WHERE deleted_at IS NULL
      DO UPDATE SET
        display_value = EXCLUDED.display_value,
        source_object_id = EXCLUDED.source_object_id,
        confidence = 1
    `, [input.organizationId, row.id, alias.type, alias.value, alias.display, input.sourceObjectId]);
  }
  await insertEvidence(client, {
    organizationId: input.organizationId,
    resourceType: "entity",
    resourceId: row.id,
    evidenceKey: input.entity.id,
    sourceEventId: input.sourceEventId,
    sourceObjectId: input.sourceObjectId,
    observedAt: input.observedAt,
  });
  return row.id;
}

function factColumns(value: JsonValue) {
  if (typeof value === "string") return [value, null, null, null, null] as const;
  if (typeof value === "number") return [null, value, null, null, null] as const;
  if (typeof value === "boolean") return [null, null, value, null, null] as const;
  if (value === null) return [null, null, null, null, stableJson(value)] as const;
  return [null, null, null, null, stableJson(value)] as const;
}

async function upsertByExternalKey(
  client: SqlQueryable,
  table: "commitments" | "decisions" | "tasks",
  organizationId: string,
  externalKey: string,
  insertSql: string,
  values: unknown[],
) {
  const existing = await client.query<{ id: string }>(`
    SELECT id FROM ops_memory.${table}
    WHERE organization_id = $1 AND external_key = $2 AND deleted_at IS NULL
    FOR UPDATE
  `, [organizationId, externalKey]);
  if (existing.rows[0]) {
    await client.query(`UPDATE ops_memory.${table} SET deleted_at = now() WHERE id = $1`, [existing.rows[0].id]);
  }
  const inserted = await client.query<{ id: string }>(insertSql, values);
  if (!inserted.rows[0]) throw new Error(`${table}_upsert_failed`);
  return inserted.rows[0].id;
}

async function persistCompiledKnowledge(
  client: TransactionClient,
  input: {
    organizationId: string;
    sourceEventId: string;
    sourceObjectId: string;
    event: ConnectorKnowledgeEvent;
  },
) {
  const state = compileEvent(input.event);
  const entityIds = new Map<string, string>();
  const counts: IngestionCounts = {
    entities: 0, relations: 0, facts: 0, metrics: 0,
    commitments: 0, decisions: 0, tasks: 0, notes: 0, softDeleted: 0,
  };
  for (const entity of state.entities) {
    const id = await upsertCompiledEntity(client, {
      organizationId: input.organizationId,
      entity,
      sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId,
      observedAt: input.event.observedAt,
    });
    entityIds.set(entity.id, id);
    counts.entities += 1;
  }

  for (const relation of state.relations) {
    const fromId = entityIds.get(relation.fromId);
    const toId = entityIds.get(relation.toId);
    if (!fromId || !toId || fromId === toId) continue;
    const [confidentiality, allowedGroups, containsPersonalData, retentionUntil] = itemAccess(relation);
    const result = await client.query<{ id: string }>(`
      INSERT INTO ops_memory.relations (
        organization_id, subject_entity_id, predicate, object_entity_id,
        confidence, source_event_id, source_object_id, observed_at,
        confidentiality, allowed_groups, contains_personal_data, retention_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (organization_id, subject_entity_id, predicate, object_entity_id)
        WHERE deleted_at IS NULL
      DO UPDATE SET
        confidence = GREATEST(ops_memory.relations.confidence, EXCLUDED.confidence),
        source_event_id = EXCLUDED.source_event_id,
        source_object_id = EXCLUDED.source_object_id,
        observed_at = GREATEST(ops_memory.relations.observed_at, EXCLUDED.observed_at),
        confidentiality = EXCLUDED.confidentiality,
        allowed_groups = EXCLUDED.allowed_groups,
        contains_personal_data = EXCLUDED.contains_personal_data,
        retention_until = EXCLUDED.retention_until
      RETURNING id
    `, [
      input.organizationId, fromId, relation.type, toId, relation.confidence,
      input.sourceEventId, input.sourceObjectId, input.event.observedAt,
      confidentiality, allowedGroups, containsPersonalData, retentionUntil,
    ]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error("relation_upsert_failed");
    await insertEvidence(client, {
      organizationId: input.organizationId, resourceType: "relation", resourceId: id,
      evidenceKey: relation.id, sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId, observedAt: input.event.observedAt,
      confidence: relation.confidence,
    });
    counts.relations += 1;
  }

  for (const fact of state.facts) {
    const subjectId = entityIds.get(fact.subjectId);
    if (!subjectId) continue;
    const values = factColumns(fact.value);
    const [confidentiality, allowedGroups, containsPersonalData, retentionUntil] = itemAccess(fact);
    const existing = await client.query<{ id: string }>(`
      SELECT id FROM ops_memory.facts
      WHERE organization_id = $1 AND subject_entity_id = $2
        AND fact_key = $3 AND deleted_at IS NULL
      FOR UPDATE
    `, [input.organizationId, subjectId, fact.id]);
    const result = existing.rows[0]
      ? await client.query<{ id: string }>(`
          UPDATE ops_memory.facts SET
            fact_type = $4, value_text = $5, value_number = $6,
            value_boolean = $7, value_date = $8, value_json = $9::jsonb,
            confidence = $10, observed_at = $11, source_event_id = $12,
            source_object_id = $13, confidentiality = $14, allowed_groups = $15,
            contains_personal_data = $16, retention_until = $17
          WHERE id = $1 AND organization_id = $2 AND subject_entity_id = $3
          RETURNING id
        `, [
          existing.rows[0].id, input.organizationId, subjectId, fact.predicate,
          values[0], values[1], values[2], values[3], values[4], fact.confidence,
          input.event.observedAt, input.sourceEventId, input.sourceObjectId,
          confidentiality, allowedGroups, containsPersonalData, retentionUntil,
        ])
      : await client.query<{ id: string }>(`
          INSERT INTO ops_memory.facts (
            organization_id, subject_entity_id, fact_type, fact_key,
            value_text, value_number, value_boolean, value_date, value_json,
            confidence, observed_at, source_event_id, source_object_id,
            confidentiality, allowed_groups, contains_personal_data, retention_until
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id
        `, [
          input.organizationId, subjectId, fact.predicate, fact.id,
          values[0], values[1], values[2], values[3], values[4], fact.confidence,
          input.event.observedAt, input.sourceEventId, input.sourceObjectId,
          confidentiality, allowedGroups, containsPersonalData, retentionUntil,
        ]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error("fact_upsert_failed");
    await insertEvidence(client, {
      organizationId: input.organizationId, resourceType: "fact", resourceId: id,
      evidenceKey: fact.id, sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId, observedAt: input.event.observedAt,
      confidence: fact.confidence,
    });
    counts.facts += 1;
  }

  for (const metric of state.metrics) {
    const entityId = entityIds.get(metric.subjectId);
    if (!entityId) continue;
    const dimensions = { knowledgeKey: metric.id, connector: input.event.source };
    const dimensionsHash = sha256(stableJson(dimensions));
    const existing = await client.query<{ id: string }>(`
      SELECT id FROM ops_memory.metric_observations
      WHERE organization_id = $1 AND metric_key = $2 AND entity_id = $3
        AND observed_at = $4 AND dimensions_hash = $5 AND deleted_at IS NULL
      FOR UPDATE
    `, [input.organizationId, metric.name, entityId, input.event.observedAt, dimensionsHash]);
    const result = existing.rows[0]
      ? await client.query<{ id: string }>(`
          UPDATE ops_memory.metric_observations SET
            value = $3, unit = $4, dimensions = $5::jsonb,
            period_start = $6, period_end = $7,
            source_event_id = $8, source_object_id = $9
          WHERE id = $1 AND organization_id = $2 RETURNING id
        `, [
          existing.rows[0].id, input.organizationId, metric.value, metric.unit,
          stableJson(dimensions), metric.periodStart ?? null, metric.periodEnd ?? null,
          input.sourceEventId, input.sourceObjectId,
        ])
      : await client.query<{ id: string }>(`
          INSERT INTO ops_memory.metric_observations (
            organization_id, entity_id, metric_key, value, unit, dimensions,
            dimensions_hash, observed_at, period_start, period_end, granularity,
            source_event_id, source_object_id
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, 'connector', $11, $12)
          RETURNING id
        `, [
          input.organizationId, entityId, metric.name, metric.value, metric.unit,
          stableJson(dimensions), dimensionsHash, input.event.observedAt,
          metric.periodStart ?? null, metric.periodEnd ?? null,
          input.sourceEventId, input.sourceObjectId,
        ]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error("metric_upsert_failed");
    await insertEvidence(client, {
      organizationId: input.organizationId, resourceType: "metric", resourceId: id,
      evidenceKey: metric.id, sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId, observedAt: input.event.observedAt,
    });
    counts.metrics += 1;
  }

  for (const commitment of state.commitments) {
    const debtor = entityIds.get(commitment.ownerId);
    const beneficiary = commitment.beneficiaryId ? entityIds.get(commitment.beneficiaryId) : null;
    const [confidentiality, allowedGroups, containsPersonalData, retentionUntil] = itemAccess(commitment);
    const status = commitment.status === "done" ? "fulfilled" : commitment.status;
    const id = await upsertByExternalKey(client, "commitments", input.organizationId, commitment.id, `
      INSERT INTO ops_memory.commitments (
        organization_id, external_key, title, status, debtor_entity_id,
        beneficiary_entity_id, committed_at, due_at, confidence,
        source_event_id, source_object_id, confidentiality, allowed_groups,
        contains_personal_data, retention_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      input.organizationId, commitment.id, commitment.action, status, debtor,
      beneficiary, input.event.observedAt, commitment.dueAt ?? null,
      input.sourceEventId, input.sourceObjectId, confidentiality, allowedGroups,
      containsPersonalData, retentionUntil,
    ]);
    await insertEvidence(client, {
      organizationId: input.organizationId, resourceType: "commitment", resourceId: id,
      evidenceKey: commitment.id, sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId, observedAt: input.event.observedAt,
    });
    counts.commitments += 1;
  }

  for (const decision of state.decisions) {
    const subject = entityIds.get(decision.subjectId);
    const owner = decision.decidedById ? entityIds.get(decision.decidedById) : null;
    const [confidentiality, allowedGroups, containsPersonalData, retentionUntil] = itemAccess(decision);
    const status = decision.status === "approved" ? "decided"
      : decision.status === "rejected" ? "reversed"
        : decision.status === "superseded" ? "expired" : "proposed";
    const id = await upsertByExternalKey(client, "decisions", input.organizationId, decision.id, `
      INSERT INTO ops_memory.decisions (
        organization_id, external_key, title, summary, status, decided_at,
        owner_entity_id, project_entity_id, source_event_id, source_object_id,
        confidentiality, allowed_groups, contains_personal_data, retention_until
      ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      input.organizationId, decision.id, decision.decision, status,
      decision.decidedAt ?? input.event.observedAt, owner, subject,
      input.sourceEventId, input.sourceObjectId, confidentiality, allowedGroups,
      containsPersonalData, retentionUntil,
    ]);
    await insertEvidence(client, {
      organizationId: input.organizationId, resourceType: "decision", resourceId: id,
      evidenceKey: decision.id, sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId, observedAt: input.event.observedAt,
    });
    counts.decisions += 1;
  }

  for (const task of state.tasks) {
    const subject = entityIds.get(task.subjectId);
    const owner = task.ownerId ? entityIds.get(task.ownerId) : null;
    const [confidentiality, allowedGroups, containsPersonalData, retentionUntil] = itemAccess(task);
    const status = task.status === "open" ? "todo" : task.status;
    const id = await upsertByExternalKey(client, "tasks", input.organizationId, task.id, `
      INSERT INTO ops_memory.tasks (
        organization_id, external_key, title, status, assigned_entity_id,
        related_entity_id, due_at, source_event_id, source_object_id,
        confidentiality, allowed_groups, contains_personal_data, retention_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      input.organizationId, task.id, task.title, status, owner, subject,
      task.dueAt ?? null, input.sourceEventId, input.sourceObjectId,
      confidentiality, allowedGroups, containsPersonalData, retentionUntil,
    ]);
    await insertEvidence(client, {
      organizationId: input.organizationId, resourceType: "task", resourceId: id,
      evidenceKey: task.id, sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId, observedAt: input.event.observedAt,
    });
    counts.tasks += 1;
  }

  for (const note of state.notes.filter((candidate) => candidate.kind === "topic")) {
    const related = note.entityIds.map((id) => entityIds.get(id)).filter(Boolean) as string[];
    const [confidentiality, allowedGroups, containsPersonalData, retentionUntil] = itemAccess(note);
    const result = await client.query<{ id: string }>(`
      INSERT INTO ops_memory.entities (
        organization_id, entity_type, canonical_key, display_name, summary,
        attributes, source_event_id, source_object_id, first_seen_at, last_seen_at,
        confidentiality, allowed_groups, contains_personal_data, retention_until
      ) VALUES ($1, 'knowledge_note', $2, $3, $4, $5::jsonb, $6, $7, $8, $8, $9, $10, $11, $12)
      ON CONFLICT (organization_id, entity_type, canonical_key) WHERE deleted_at IS NULL
      DO UPDATE SET
        display_name = EXCLUDED.display_name, summary = EXCLUDED.summary,
        attributes = EXCLUDED.attributes, source_event_id = EXCLUDED.source_event_id,
        source_object_id = EXCLUDED.source_object_id,
        last_seen_at = EXCLUDED.last_seen_at,
        confidentiality = EXCLUDED.confidentiality,
        allowed_groups = EXCLUDED.allowed_groups,
        contains_personal_data = EXCLUDED.contains_personal_data,
        retention_until = EXCLUDED.retention_until
      RETURNING id
    `, [
      input.organizationId, `note:${note.id}`, note.title, note.summary,
      stableJson({ body: note.body, topic: note.topic, relatedEntityIds: related }),
      input.sourceEventId, input.sourceObjectId, input.event.observedAt,
      confidentiality, allowedGroups, containsPersonalData, retentionUntil,
    ]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error("note_upsert_failed");
    await insertEvidence(client, {
      organizationId: input.organizationId, resourceType: "entity", resourceId: id,
      evidenceKey: note.id, sourceEventId: input.sourceEventId,
      sourceObjectId: input.sourceObjectId, observedAt: input.event.observedAt,
    });
    counts.notes += 1;
  }
  return counts;
}

const RESOURCE_TABLES: Record<string, string> = {
  relation: "relations",
  fact: "facts",
  metric: "metric_observations",
  commitment: "commitments",
  decision: "decisions",
  task: "tasks",
  document: "documents",
};

async function retirePreviousEvidence(
  client: SqlQueryable,
  organizationId: string,
  sourceObjectId: string,
  currentEventId?: string,
) {
  const old = await client.query<{ resource_type: string; resource_id: string }>(`
    SELECT resource_type, resource_id
    FROM ops_memory.knowledge_evidence
    WHERE organization_id = $1 AND source_object_id = $2
      AND deleted_at IS NULL
      AND ($3::uuid IS NULL OR source_event_id <> $3)
  `, [organizationId, sourceObjectId, currentEventId ?? null]);
  await client.query(`
    UPDATE ops_memory.knowledge_evidence SET deleted_at = now()
    WHERE organization_id = $1 AND source_object_id = $2
      AND deleted_at IS NULL
      AND ($3::uuid IS NULL OR source_event_id <> $3)
  `, [organizationId, sourceObjectId, currentEventId ?? null]);

  let deleted = 0;
  const grouped = new Map<string, string[]>();
  for (const row of old.rows) {
    const values = grouped.get(row.resource_type) ?? [];
    values.push(row.resource_id);
    grouped.set(row.resource_type, values);
  }
  for (const [resourceType, ids] of grouped) {
    const uniqueIds = [...new Set(ids)];
    if (resourceType === "entity") {
      const result = await client.query(`
        UPDATE ops_memory.entities entity SET deleted_at = now(), status = 'archived'
        WHERE entity.organization_id = $1 AND entity.id = ANY($2::uuid[])
          AND entity.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM ops_memory.knowledge_evidence evidence
            WHERE evidence.organization_id = entity.organization_id
              AND evidence.resource_type = 'entity'
              AND evidence.resource_id = entity.id
              AND evidence.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM ops_memory.relations relation
            WHERE relation.organization_id = entity.organization_id
              AND relation.deleted_at IS NULL
              AND (relation.subject_entity_id = entity.id OR relation.object_entity_id = entity.id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM ops_memory.facts fact
            WHERE fact.organization_id = entity.organization_id
              AND fact.deleted_at IS NULL AND fact.subject_entity_id = entity.id
          )
      `, [organizationId, uniqueIds]);
      deleted += result.rowCount ?? 0;
      continue;
    }
    const table = RESOURCE_TABLES[resourceType];
    if (!table) continue;
    const result = await client.query(`
      UPDATE ops_memory.${table} resource SET deleted_at = now()
      WHERE resource.organization_id = $1 AND resource.id = ANY($2::uuid[])
        AND resource.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ops_memory.knowledge_evidence evidence
          WHERE evidence.organization_id = resource.organization_id
            AND evidence.resource_type = $3
            AND evidence.resource_id = resource.id
            AND evidence.deleted_at IS NULL
        )
    `, [organizationId, uniqueIds, resourceType]);
    deleted += result.rowCount ?? 0;
  }
  return deleted;
}

export class ConnectorKnowledgeIngestionService {
  private readonly repository: CentralMemoryRepository;

  constructor(private readonly pool: CentralMemoryPool) {
    this.repository = new CentralMemoryRepository(pool);
  }

  async ingest(rawEvent: unknown, actor: IngestionActor): Promise<ConnectorIngestionResult> {
    const event = parseConnectorKnowledgeEvent(rawEvent);
    const organization = await resolveOrganization(this.pool, event.tenantId);
    const retentionUntil = event.access.retentionUntil ? new Date(event.access.retentionUntil) : undefined;
    const access = {
      confidentiality: event.access.confidentiality as Confidentiality,
      allowedGroups: event.access.allowedGroups,
      containsPersonalData: event.access.containsPersonalData,
      retentionUntil,
    };
    const ingested = await this.repository.ingestSourceEvent({
      organizationId: organization.id,
      sourceType: event.source,
      sourceAccountId: event.sourceAccountId,
      sourceId: event.sourceRecordId,
      eventType: `${event.source}.${event.operation}`,
      occurredAt: new Date(event.occurredAt ?? event.observedAt),
      idempotencyKey: `connector:${event.source}:${event.sourceAccountId}:${event.eventId}`,
      payload: event as unknown as Record<string, unknown>,
      sourceObject: event.operation === "upsert" && event.sourceObject ? {
        sourceId: event.sourceRecordId,
        objectType: event.sourceObject.objectType,
        title: event.sourceObject.title,
        contentText: event.sourceObject.contentText,
        content: event.sourceObject.content as Record<string, unknown> | undefined,
        metadata: {
          ...(event.sourceObject.metadata as Record<string, unknown> | undefined),
          sourceVersion: event.sourceVersion,
        },
        sourceUrl: event.sourceObject.sourceUrl,
        mimeType: event.sourceObject.mimeType,
        sourceCreatedAt: event.sourceObject.sourceCreatedAt ? new Date(event.sourceObject.sourceCreatedAt) : undefined,
        sourceUpdatedAt: new Date(event.sourceObject.sourceUpdatedAt ?? event.observedAt),
        access,
      } : undefined,
      access,
      audit: {
        actorType: "connector",
        actorId: actor.actorId,
        requestId: actor.requestId,
        correlationId: actor.correlationId,
      },
    });

    try {
      return await this.repository.withTransaction(async (client) => {
        const locked = await client.query<{
          id: string;
          processing_state: string;
          source_object_id: string | null;
          source_updated_at: string | null;
          last_event_id: string | null;
        }>(`
          SELECT event.id, event.processing_state,
            object.id AS source_object_id, object.source_updated_at,
            object.last_event_id
          FROM ops_memory.source_events event
          LEFT JOIN ops_memory.source_objects object
            ON object.organization_id = event.organization_id
            AND object.source_type = event.source_type
            AND object.source_account_id = event.source_account_id
            AND object.source_id = event.source_id
          WHERE event.id = $1 AND event.organization_id = $2
          FOR UPDATE OF event
        `, [ingested.event.id, organization.id]);
        const row = locked.rows[0];
        if (!row) throw new Error("source_event_not_found");
        if (row.processing_state === "processed" || row.processing_state === "ignored") {
          return {
            eventId: event.eventId,
            sourceEventId: row.id,
            sourceObjectId: row.source_object_id,
            duplicate: true,
            stale: row.processing_state === "ignored",
            processingState: row.processing_state,
            counts: { entities: 0, relations: 0, facts: 0, metrics: 0, commitments: 0, decisions: 0, tasks: 0, notes: 0, softDeleted: 0 },
          } as ConnectorIngestionResult;
        }

        const staleUpsert = event.operation === "upsert" && row.last_event_id !== row.id;
        const staleDelete = event.operation === "delete"
          && row.source_updated_at !== null
          && new Date(row.source_updated_at).getTime() > new Date(event.observedAt).getTime();
        if (staleUpsert || staleDelete) {
          await client.query(`
            UPDATE ops_memory.source_events SET processing_state = 'ignored', processed_at = now()
            WHERE id = $1 AND organization_id = $2
          `, [row.id, organization.id]);
          await appendAudit(client, {
            organizationId: organization.id,
            actor,
            action: "connector_event.ignored_stale",
            resourceType: "source_event",
            resourceId: row.id,
            sourceEventId: row.id,
            afterState: { sourceVersion: event.sourceVersion, observedAt: event.observedAt },
          });
          return {
            eventId: event.eventId,
            sourceEventId: row.id,
            sourceObjectId: row.source_object_id,
            duplicate: ingested.duplicate,
            stale: true,
            processingState: "ignored",
            counts: { entities: 0, relations: 0, facts: 0, metrics: 0, commitments: 0, decisions: 0, tasks: 0, notes: 0, softDeleted: 0 },
          };
        }

        await client.query(`
          UPDATE ops_memory.source_events SET processing_state = 'processing', last_error = NULL
          WHERE id = $1 AND organization_id = $2
        `, [row.id, organization.id]);

        let counts: IngestionCounts = { entities: 0, relations: 0, facts: 0, metrics: 0, commitments: 0, decisions: 0, tasks: 0, notes: 0, softDeleted: 0 };
        if (event.operation === "delete") {
          if (row.source_object_id) {
            await client.query(`
              UPDATE ops_memory.source_objects SET
                is_current = false, source_deleted_at = $3, last_event_id = $4
              WHERE id = $1 AND organization_id = $2
            `, [row.source_object_id, organization.id, event.observedAt, row.id]);
            counts.softDeleted = await retirePreviousEvidence(client, organization.id, row.source_object_id);
          }
        } else {
          if (!row.source_object_id) throw new Error("source_object_not_found");
          counts = await persistCompiledKnowledge(client, {
            organizationId: organization.id,
            sourceEventId: row.id,
            sourceObjectId: row.source_object_id,
            event,
          });
          counts.softDeleted = await retirePreviousEvidence(
            client,
            organization.id,
            row.source_object_id,
            row.id,
          );
        }

        await client.query(`
          UPDATE ops_memory.source_events SET
            processing_state = 'processed', processed_at = now(), last_error = NULL
          WHERE id = $1 AND organization_id = $2
        `, [row.id, organization.id]);
        await appendAudit(client, {
          organizationId: organization.id,
          actor,
          action: event.operation === "delete" ? "connector_object.soft_deleted" : "connector_knowledge.processed",
          resourceType: "source_event",
          resourceId: row.id,
          sourceEventId: row.id,
          afterState: { operation: event.operation, source: event.source, counts },
          metadata: { sourceRecordId: event.sourceRecordId, sourceVersion: event.sourceVersion },
        });
        return {
          eventId: event.eventId,
          sourceEventId: row.id,
          sourceObjectId: row.source_object_id,
          duplicate: ingested.duplicate,
          stale: false,
          processingState: "processed",
          counts,
        };
      });
    } catch (error) {
      await this.pool.query(`
        UPDATE ops_memory.source_events SET
          processing_state = 'failed', retry_count = retry_count + 1,
          last_error = left($3, 2_000)
        WHERE id = $1 AND organization_id = $2
      `, [ingested.event.id, organization.id, error instanceof Error ? error.message : "unknown ingestion error"]);
      throw error;
    }
  }

  async stats(tenantId: string) {
    const organization = await resolveOrganization(this.pool, tenantId);
    const totals = await this.pool.query<{
      events_24h: number;
      pending: number;
      failed: number;
      current_objects: number;
      evidence: number;
      last_received_at: string | null;
    }>(`
      SELECT
        count(*) FILTER (WHERE event.received_at >= now() - interval '24 hours')::int AS events_24h,
        count(*) FILTER (WHERE event.processing_state IN ('pending', 'processing'))::int AS pending,
        count(*) FILTER (WHERE event.processing_state = 'failed')::int AS failed,
        (SELECT count(*)::int FROM ops_memory.source_objects object
          WHERE object.organization_id = $1 AND object.is_current
            AND object.deleted_at IS NULL AND object.source_deleted_at IS NULL) AS current_objects,
        (SELECT count(*)::int FROM ops_memory.knowledge_evidence evidence
          WHERE evidence.organization_id = $1 AND evidence.deleted_at IS NULL) AS evidence,
        max(event.received_at)::text AS last_received_at
      FROM ops_memory.source_events event
      WHERE event.organization_id = $1 AND event.deleted_at IS NULL
    `, [organization.id]);
    const sources = await this.pool.query<{ source_type: string; objects: number }>(`
      SELECT source_type, count(*)::int AS objects
      FROM ops_memory.source_objects
      WHERE organization_id = $1 AND is_current
        AND deleted_at IS NULL AND source_deleted_at IS NULL
      GROUP BY source_type ORDER BY source_type
    `, [organization.id]);
    return { tenantId, ...totals.rows[0], sources: sources.rows };
  }
}

