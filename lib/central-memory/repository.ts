import { createHash } from "node:crypto";
import type {
  CentralMemoryPool,
  SqlQueryable,
  TransactionClient,
} from "@/lib/central-memory/database";

export type JsonObject = Record<string, unknown>;

type AuditContext = {
  actorType: "human" | "agent" | "connector" | "system";
  actorId: string;
  requestId?: string;
  correlationId?: string;
};

export type MemoryAccessInput = {
  confidentiality?: "public" | "internal" | "confidential" | "restricted";
  allowedGroups?: string[];
  containsPersonalData?: boolean;
  retentionUntil?: Date;
};

export type OrganizationRow = {
  id: string;
  slug: string;
  display_name: string;
};

export type SourceEventRow = {
  id: string;
  organization_id: string;
  source_type: string;
  source_account_id: string;
  source_id: string;
  event_type: string;
  occurred_at: Date | string;
  idempotency_key: string;
  processing_state: string;
};

export type SourceObjectRow = {
  id: string;
  organization_id: string;
  source_type: string;
  source_account_id: string;
  source_id: string;
  object_type: string;
  title: string | null;
  source_updated_at: Date | string | null;
};

export type EntityRow = {
  id: string;
  organization_id: string;
  entity_type: string;
  canonical_key: string;
  display_name: string;
  summary: string | null;
  attributes: JsonObject;
};

export type RelationRow = {
  id: string;
  organization_id: string;
  subject_entity_id: string;
  predicate: string;
  object_entity_id: string;
  properties: JsonObject;
};

export type MemorySearchRow = {
  record_type: string;
  record_id: string;
  subtype: string;
  title: string;
  content: string;
  source_type: string;
  source_id: string;
  source_event_id: string | null;
  confidentiality: string;
  updated_at: Date | string;
  rank: number;
};

export type GraphNodeRow = {
  id: string;
  node_type: string;
  label: string;
  summary: string | null;
  attributes: JsonObject;
  confidence: number;
  degree: number;
  fact_count: number;
};

export type GraphEdgeRow = {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  properties: JsonObject;
  confidence: number;
};

export type SourceObjectInput = {
  sourceId: string;
  objectType: string;
  title?: string;
  contentText?: string;
  content?: JsonObject;
  metadata?: JsonObject;
  sourceUrl?: string;
  mimeType?: string;
  sourceCreatedAt?: Date;
  sourceUpdatedAt?: Date;
  access?: MemoryAccessInput;
};

export type IngestSourceEventInput = {
  organizationId: string;
  sourceType: string;
  sourceAccountId?: string;
  sourceId: string;
  eventType: string;
  occurredAt: Date;
  idempotencyKey: string;
  schemaVersion?: number;
  payload?: JsonObject;
  sourceObject?: SourceObjectInput;
  access?: MemoryAccessInput;
  audit: AuditContext;
};

export type IngestSourceEventResult = {
  event: SourceEventRow;
  sourceObject: SourceObjectRow | null;
  duplicate: boolean;
};

export type UpsertEntityInput = {
  organizationId: string;
  entityType: string;
  canonicalKey: string;
  displayName: string;
  summary?: string;
  attributes?: JsonObject;
  confidence?: number;
  sourceEventId?: string;
  sourceObjectId?: string;
  observedAt?: Date;
};

export type UpsertRelationInput = {
  organizationId: string;
  subjectEntityId: string;
  predicate: string;
  objectEntityId: string;
  properties?: JsonObject;
  confidence?: number;
  sourceEventId?: string;
  sourceObjectId?: string;
  evidenceText?: string;
  observedAt?: Date;
};

function canonicalJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalJson(child)]),
    );
  }
  return String(value);
}

function stableJson(value: JsonObject | undefined) {
  return JSON.stringify(canonicalJson(value ?? {}));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assertIdentifier(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > 512) throw new Error(`${label} is too long.`);
  return trimmed;
}

function confidence(value: number | undefined) {
  const result = value ?? 1;
  if (!Number.isFinite(result) || result < 0 || result > 1) {
    throw new Error("confidence must be between 0 and 1.");
  }
  return result;
}

export class CentralMemoryRepository {
  constructor(private readonly pool: CentralMemoryPool) {}

  async withTransaction<T>(
    operation: (client: TransactionClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await operation(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original operation error. A broken connection is evicted
        // by pg when release is called.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertOrganization(input: {
    slug: string;
    displayName: string;
    timezone?: string;
    settings?: JsonObject;
  }): Promise<OrganizationRow> {
    const slug = assertIdentifier(input.slug, "slug");
    const displayName = assertIdentifier(input.displayName, "displayName");
    const result = await this.pool.query<OrganizationRow>(`
      INSERT INTO ops_memory.organizations (slug, display_name, timezone, settings)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (slug) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        timezone = EXCLUDED.timezone,
        settings = ops_memory.organizations.settings || EXCLUDED.settings,
        deleted_at = NULL
      RETURNING id, slug, display_name
    `, [slug, displayName, input.timezone ?? "Europe/Paris", stableJson(input.settings)]);
    return result.rows[0];
  }

  async ingestSourceEvent(input: IngestSourceEventInput): Promise<IngestSourceEventResult> {
    return this.withTransaction(async (client) => {
      const sourceType = assertIdentifier(input.sourceType, "sourceType");
      const sourceAccountId = assertIdentifier(
        input.sourceAccountId ?? "default",
        "sourceAccountId",
      );
      const sourceId = assertIdentifier(input.sourceId, "sourceId");
      const eventType = assertIdentifier(input.eventType, "eventType");
      const idempotencyKey = assertIdentifier(input.idempotencyKey, "idempotencyKey");
      const payload = stableJson(input.payload);
      const access = input.access ?? {};
      const inserted = await client.query<SourceEventRow>(`
        INSERT INTO ops_memory.source_events (
          organization_id, source_type, source_account_id, source_id, event_type,
          occurred_at, schema_version, idempotency_key, content_hash, payload,
          confidentiality, allowed_groups, contains_personal_data, retention_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
        ON CONFLICT (organization_id, idempotency_key) DO NOTHING
        RETURNING id, organization_id, source_type, source_account_id, source_id,
          event_type, occurred_at, idempotency_key, processing_state
      `, [
        input.organizationId,
        sourceType,
        sourceAccountId,
        sourceId,
        eventType,
        input.occurredAt,
        input.schemaVersion ?? 1,
        idempotencyKey,
        sha256(payload),
        payload,
        access.confidentiality ?? "internal",
        access.allowedGroups ?? [],
        access.containsPersonalData ?? false,
        access.retentionUntil ?? null,
      ]);

      let duplicate = false;
      let event = inserted.rows[0];
      if (!event) {
        duplicate = true;
        const existing = await client.query<SourceEventRow>(`
          SELECT id, organization_id, source_type, source_account_id, source_id,
            event_type, occurred_at, idempotency_key, processing_state
          FROM ops_memory.source_events
          WHERE organization_id = $1 AND idempotency_key = $2
        `, [input.organizationId, idempotencyKey]);
        event = existing.rows[0];
        if (!event) throw new Error("Idempotent source event could not be resolved.");
      }

      let sourceObject: SourceObjectRow | null = null;
      if (input.sourceObject && !duplicate) {
        sourceObject = await this.upsertSourceObject(client, {
          organizationId: input.organizationId,
          sourceType,
          sourceAccountId,
          eventId: event.id,
          value: input.sourceObject,
        });
      } else if (input.sourceObject) {
        const existingObject = await client.query<SourceObjectRow>(`
          SELECT id, organization_id, source_type, source_account_id, source_id,
            object_type, title, source_updated_at
          FROM ops_memory.source_objects
          WHERE organization_id = $1 AND source_type = $2
            AND source_account_id = $3 AND source_id = $4
        `, [
          input.organizationId,
          sourceType,
          sourceAccountId,
          input.sourceObject.sourceId,
        ]);
        sourceObject = existingObject.rows[0] ?? null;
      }

      if (!duplicate) {
        await this.appendAudit(client, {
          organizationId: input.organizationId,
          context: input.audit,
          action: "source_event.ingested",
          resourceType: "source_event",
          resourceId: event.id,
          sourceEventId: event.id,
          afterState: {
            sourceType,
            sourceId,
            eventType,
            sourceObjectId: sourceObject?.id,
          },
        });
      }
      return { event, sourceObject, duplicate };
    });
  }

  async upsertEntity(input: UpsertEntityInput): Promise<EntityRow> {
    const observedAt = input.observedAt ?? new Date();
    const result = await this.pool.query<EntityRow>(`
      INSERT INTO ops_memory.entities (
        organization_id, entity_type, canonical_key, display_name, summary,
        attributes, confidence, source_event_id, source_object_id,
        first_seen_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $10)
      ON CONFLICT (organization_id, entity_type, canonical_key)
        WHERE deleted_at IS NULL
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        summary = COALESCE(EXCLUDED.summary, ops_memory.entities.summary),
        attributes = ops_memory.entities.attributes || EXCLUDED.attributes,
        confidence = GREATEST(ops_memory.entities.confidence, EXCLUDED.confidence),
        source_event_id = COALESCE(EXCLUDED.source_event_id, ops_memory.entities.source_event_id),
        source_object_id = COALESCE(EXCLUDED.source_object_id, ops_memory.entities.source_object_id),
        last_seen_at = GREATEST(ops_memory.entities.last_seen_at, EXCLUDED.last_seen_at)
      RETURNING id, organization_id, entity_type, canonical_key, display_name,
        summary, attributes
    `, [
      input.organizationId,
      assertIdentifier(input.entityType, "entityType"),
      assertIdentifier(input.canonicalKey, "canonicalKey"),
      assertIdentifier(input.displayName, "displayName"),
      input.summary?.trim() || null,
      stableJson(input.attributes),
      confidence(input.confidence),
      input.sourceEventId ?? null,
      input.sourceObjectId ?? null,
      observedAt,
    ]);
    return result.rows[0];
  }

  async upsertRelation(input: UpsertRelationInput): Promise<RelationRow> {
    const result = await this.pool.query<RelationRow>(`
      INSERT INTO ops_memory.relations (
        organization_id, subject_entity_id, predicate, object_entity_id,
        properties, confidence, source_event_id, source_object_id,
        evidence_text, observed_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
      ON CONFLICT (organization_id, subject_entity_id, predicate, object_entity_id)
        WHERE deleted_at IS NULL
      DO UPDATE SET
        properties = ops_memory.relations.properties || EXCLUDED.properties,
        confidence = GREATEST(ops_memory.relations.confidence, EXCLUDED.confidence),
        source_event_id = COALESCE(EXCLUDED.source_event_id, ops_memory.relations.source_event_id),
        source_object_id = COALESCE(EXCLUDED.source_object_id, ops_memory.relations.source_object_id),
        evidence_text = COALESCE(EXCLUDED.evidence_text, ops_memory.relations.evidence_text),
        observed_at = GREATEST(ops_memory.relations.observed_at, EXCLUDED.observed_at)
      RETURNING id, organization_id, subject_entity_id, predicate,
        object_entity_id, properties
    `, [
      input.organizationId,
      input.subjectEntityId,
      assertIdentifier(input.predicate, "predicate"),
      input.objectEntityId,
      stableJson(input.properties),
      confidence(input.confidence),
      input.sourceEventId ?? null,
      input.sourceObjectId ?? null,
      input.evidenceText?.trim() || null,
      input.observedAt ?? new Date(),
    ]);
    return result.rows[0];
  }

  async searchMemory(input: {
    organizationId: string;
    query: string;
    allowedGroups?: string[];
    limit?: number;
  }): Promise<MemorySearchRow[]> {
    const query = assertIdentifier(input.query, "query");
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 20)));
    const result = await this.pool.query<MemorySearchRow>(`
      WITH search AS (
        SELECT websearch_to_tsquery('simple', $2) AS terms
      )
      SELECT
        corpus.record_type,
        corpus.record_id,
        corpus.subtype,
        corpus.title,
        corpus.content,
        corpus.source_type,
        corpus.source_id,
        corpus.source_event_id,
        corpus.confidentiality,
        corpus.updated_at,
        (
          ts_rank_cd(corpus.search_vector, search.terms)
          + CASE WHEN corpus.title ILIKE '%' || $2 || '%' THEN 0.5 ELSE 0 END
        )::double precision AS rank
      FROM ops_memory.memory_search_corpus corpus
      CROSS JOIN search
      WHERE corpus.organization_id = $1
        AND (
          corpus.confidentiality IN ('public', 'internal')
          OR corpus.allowed_groups && $3::text[]
        )
        AND (
          corpus.search_vector @@ search.terms
          OR corpus.title ILIKE '%' || $2 || '%'
          OR corpus.content ILIKE '%' || $2 || '%'
        )
      ORDER BY rank DESC, corpus.updated_at DESC
      LIMIT $4
    `, [input.organizationId, query, input.allowedGroups ?? [], limit]);
    return result.rows;
  }

  async getGraphSnapshot(input: {
    organizationId: string;
    allowedGroups?: string[];
    limit?: number;
  }): Promise<{ nodes: GraphNodeRow[]; edges: GraphEdgeRow[] }> {
    const limit = Math.min(5_000, Math.max(1, Math.trunc(input.limit ?? 1_000)));
    const groups = input.allowedGroups ?? [];
    const nodes = await this.pool.query<GraphNodeRow>(`
      SELECT id, node_type, label, summary, attributes, confidence, degree, fact_count
      FROM ops_memory.graph_nodes
      WHERE organization_id = $1
        AND (
          confidentiality IN ('public', 'internal')
          OR allowed_groups && $2::text[]
        )
      ORDER BY degree DESC, fact_count DESC, label
      LIMIT $3
    `, [input.organizationId, groups, limit]);
    const nodeIds = nodes.rows.map((node) => node.id);
    if (nodeIds.length === 0) return { nodes: [], edges: [] };
    const edges = await this.pool.query<GraphEdgeRow>(`
      SELECT id, source_id, target_id, edge_type, properties, confidence
      FROM ops_memory.graph_edges
      WHERE organization_id = $1
        AND source_id = ANY($2::uuid[])
        AND target_id = ANY($2::uuid[])
        AND (
          confidentiality IN ('public', 'internal')
          OR allowed_groups && $3::text[]
        )
      ORDER BY confidence DESC, observed_at DESC
    `, [input.organizationId, nodeIds, groups]);
    return { nodes: nodes.rows, edges: edges.rows };
  }

  async softDeleteEntity(input: {
    organizationId: string;
    entityId: string;
    audit: AuditContext;
  }): Promise<boolean> {
    return this.withTransaction(async (client) => {
      const before = await client.query<EntityRow>(`
        SELECT id, organization_id, entity_type, canonical_key, display_name,
          summary, attributes
        FROM ops_memory.entities
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [input.entityId, input.organizationId]);
      if (!before.rows[0]) return false;
      await client.query(`
        UPDATE ops_memory.entities
        SET deleted_at = now(), status = 'archived'
        WHERE id = $1 AND organization_id = $2
      `, [input.entityId, input.organizationId]);
      await this.appendAudit(client, {
        organizationId: input.organizationId,
        context: input.audit,
        action: "entity.soft_deleted",
        resourceType: "entity",
        resourceId: input.entityId,
        beforeState: before.rows[0] as unknown as JsonObject,
      });
      return true;
    });
  }

  private async upsertSourceObject(
    client: SqlQueryable,
    input: {
      organizationId: string;
      sourceType: string;
      sourceAccountId: string;
      eventId: string;
      value: SourceObjectInput;
    },
  ): Promise<SourceObjectRow> {
    const content = stableJson(input.value.content);
    const contentText = input.value.contentText?.trim() || null;
    const contentHash = sha256(`${input.value.title ?? ""}\n${contentText ?? ""}\n${content}`);
    const values = [
      input.organizationId,
      input.sourceType,
      input.sourceAccountId,
      assertIdentifier(input.value.sourceId, "sourceObject.sourceId"),
      assertIdentifier(input.value.objectType, "sourceObject.objectType"),
      input.value.title?.trim() || null,
      contentText,
      content,
      stableJson(input.value.metadata),
      input.value.sourceUrl?.trim() || null,
      input.value.mimeType?.trim() || null,
      contentHash,
      input.value.sourceCreatedAt ?? null,
      input.value.sourceUpdatedAt ?? null,
      input.eventId,
      input.value.access?.confidentiality ?? "internal",
      input.value.access?.allowedGroups ?? [],
      input.value.access?.containsPersonalData ?? false,
      input.value.access?.retentionUntil ?? null,
    ];
    const upserted = await client.query<SourceObjectRow>(`
      INSERT INTO ops_memory.source_objects (
        organization_id, source_type, source_account_id, source_id, object_type,
        title, content_text, content_json, metadata, source_url, mime_type,
        content_hash, source_created_at, source_updated_at, last_event_id,
        confidentiality, allowed_groups, contains_personal_data, retention_until
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19
      )
      ON CONFLICT (organization_id, source_type, source_account_id, source_id)
      DO UPDATE SET
        object_type = EXCLUDED.object_type,
        title = EXCLUDED.title,
        content_text = EXCLUDED.content_text,
        content_json = EXCLUDED.content_json,
        metadata = ops_memory.source_objects.metadata || EXCLUDED.metadata,
        source_url = EXCLUDED.source_url,
        mime_type = EXCLUDED.mime_type,
        content_hash = EXCLUDED.content_hash,
        source_created_at = COALESCE(ops_memory.source_objects.source_created_at, EXCLUDED.source_created_at),
        source_updated_at = EXCLUDED.source_updated_at,
        last_event_id = EXCLUDED.last_event_id,
        version = ops_memory.source_objects.version + 1,
        is_current = true,
        source_deleted_at = NULL,
        deleted_at = NULL,
        confidentiality = EXCLUDED.confidentiality,
        allowed_groups = EXCLUDED.allowed_groups,
        contains_personal_data = EXCLUDED.contains_personal_data,
        retention_until = EXCLUDED.retention_until
      WHERE EXCLUDED.source_updated_at IS NULL
        OR ops_memory.source_objects.source_updated_at IS NULL
        OR EXCLUDED.source_updated_at >= ops_memory.source_objects.source_updated_at
      RETURNING id, organization_id, source_type, source_account_id, source_id,
        object_type, title, source_updated_at
    `, values);
    if (upserted.rows[0]) return upserted.rows[0];

    const current = await client.query<SourceObjectRow>(`
      SELECT id, organization_id, source_type, source_account_id, source_id,
        object_type, title, source_updated_at
      FROM ops_memory.source_objects
      WHERE organization_id = $1 AND source_type = $2
        AND source_account_id = $3 AND source_id = $4
    `, values.slice(0, 4));
    if (!current.rows[0]) throw new Error("Source object upsert did not resolve a row.");
    return current.rows[0];
  }

  private async appendAudit(
    client: SqlQueryable,
    input: {
      organizationId: string;
      context: AuditContext;
      action: string;
      resourceType: string;
      resourceId: string;
      sourceEventId?: string;
      beforeState?: JsonObject;
      afterState?: JsonObject;
      metadata?: JsonObject;
    },
  ) {
    await client.query(`
      INSERT INTO ops_memory.audit_logs (
        organization_id, actor_type, actor_id, action, resource_type, resource_id,
        request_id, correlation_id, source_event_id, before_state, after_state, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
    `, [
      input.organizationId,
      input.context.actorType,
      assertIdentifier(input.context.actorId, "audit.actorId"),
      input.action,
      input.resourceType,
      input.resourceId,
      input.context.requestId ?? null,
      input.context.correlationId ?? null,
      input.sourceEventId ?? null,
      input.beforeState ? stableJson(input.beforeState) : null,
      input.afterState ? stableJson(input.afterState) : null,
      stableJson(input.metadata),
    ]);
  }
}
