import { createHash } from "node:crypto";
import type {
  CompanyMemoryUniverse,
  DecisionRecord,
  MemoryRecord,
  MetricRecord,
  TaskRecord,
} from "@/lib/company-memory-schema";
import type {
  CentralMemoryPool,
  TransactionClient,
} from "@/lib/central-memory/database";

type BusinessRecord = Exclude<
  | CompanyMemoryUniverse["clients"][number]
  | CompanyMemoryUniverse["contacts"][number]
  | CompanyMemoryUniverse["opportunities"][number]
  | CompanyMemoryUniverse["projects"][number]
  | CompanyMemoryUniverse["invoices"][number]
  | CompanyMemoryUniverse["payments"][number]
  | CompanyMemoryUniverse["emailThreads"][number]
  | CompanyMemoryUniverse["emailMessages"][number]
  | CompanyMemoryUniverse["meetings"][number]
  | CompanyMemoryUniverse["metrics"][number]
  | CompanyMemoryUniverse["decisions"][number]
  | CompanyMemoryUniverse["tasks"][number]
  | CompanyMemoryUniverse["documents"][number]
  | CompanyMemoryUniverse["commitments"][number],
  never
>;

type DurableRecord = Exclude<
  BusinessRecord,
  CompanyMemoryUniverse["emailMessages"][number] | MetricRecord
>;

export type UniverseLoaderPool = Pick<CentralMemoryPool, "connect">;

export type UniverseLoaderOptions = {
  batchSize?: number;
  sourceAccountId?: string;
};

export type UniverseLoadCounts = {
  organizations: number;
  sourceEvents: number;
  sourceObjects: number;
  entities: number;
  relations: number;
  facts: number;
  metricObservations: number;
  commitments: number;
  decisions: number;
  tasks: number;
  documents: number;
};

export type UniverseLoadResult = {
  organizationId: string;
  organizationSlug: string;
  dataset: {
    seed: string;
    generatedAt: string;
    schemaVersion: string;
  };
  counts: UniverseLoadCounts;
};

const DEFAULT_BATCH_SIZE = 250;

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** A deterministic RFC-4122 UUID derived from a namespace string. */
export function deterministicMemoryUuid(namespace: string) {
  const bytes = Buffer.from(sha256(namespace).slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function organizationSlug(universe: CompanyMemoryUniverse) {
  return universe.tenant.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

function eventIdempotencyKey(universe: CompanyMemoryUniverse, externalEventId: string, checksum: string) {
  return `universe:${universe.tenant.id}:${externalEventId}:${checksum}`;
}

function businessRecords(universe: CompanyMemoryUniverse): BusinessRecord[] {
  return [
    ...universe.clients,
    ...universe.contacts,
    ...universe.opportunities,
    ...universe.projects,
    ...universe.invoices,
    ...universe.payments,
    ...universe.emailThreads,
    ...universe.emailMessages,
    ...universe.meetings,
    ...universe.metrics,
    ...universe.decisions,
    ...universe.tasks,
    ...universe.documents,
    ...universe.commitments,
  ];
}

function durableRecords(universe: CompanyMemoryUniverse): DurableRecord[] {
  return businessRecords(universe).filter(
    (record): record is DurableRecord => record.kind !== "email-message" && record.kind !== "metric",
  );
}

function displayName(record: DurableRecord) {
  switch (record.kind) {
    case "client": return record.name;
    case "contact": return record.fullName;
    case "opportunity": return record.name;
    case "project": return record.name;
    case "invoice": return record.invoiceNumber;
    case "payment": return record.bankReference;
    case "email-thread": return record.subject;
    case "meeting": return record.title;
    case "decision": return record.title;
    case "task": return record.title;
    case "document": return record.title;
    case "commitment": return record.description;
  }
}

function recordSummary(record: DurableRecord) {
  switch (record.kind) {
    case "client": return `${record.legalName} · ${record.segment} · ${record.city} · ${record.status}`;
    case "contact": return `${record.role} chez ${record.clientId} · ${record.email}`;
    case "opportunity": return `${record.stage} · ${(record.amountCents / 100).toFixed(2)} EUR · prochaine étape : ${record.nextStep}`;
    case "project": return `${record.status} · ${record.progressPercent} % · ${record.riskSummary ?? "aucun risque déclaré"}`;
    case "invoice": return `${record.status} · ${(record.amountIncludingTaxCents / 100).toFixed(2)} EUR TTC · échéance ${record.dueOn}`;
    case "payment": return `${(record.amountCents / 100).toFixed(2)} EUR reçus le ${record.paidOn}`;
    case "email-thread": return record.extractedSummary;
    case "meeting": return record.summary;
    case "decision": return `${record.rationale} ${record.outcome}`.trim();
    case "task": return record.description;
    case "document": return record.summary;
    case "commitment": return `${record.committedBy} s'engage pour le ${record.dueOn} · ${record.status}`;
  }
}

function searchableText(record: BusinessRecord) {
  switch (record.kind) {
    case "email-message":
      return `${record.subject}\nDe : ${record.sender}\nÀ : ${record.recipients.join(", ")}\n${record.text}`;
    case "metric":
      return `${record.domain} ${record.metric} ${record.value} ${record.unit} ${record.periodStart} ${stableJson(record.dimensions)}`;
    default:
      return `${displayName(record)}\n${recordSummary(record)}`;
  }
}

function chunks<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function batchJson(
  client: TransactionClient,
  sql: string,
  rows: readonly Record<string, unknown>[],
  batchSize: number,
) {
  for (const batch of chunks(rows, batchSize)) {
    if (batch.length === 0) continue;
    await client.query(sql, [JSON.stringify(batch)]);
  }
}

function validateUniverse(universe: CompanyMemoryUniverse) {
  if (universe.schemaVersion !== "1.0") {
    throw new Error(`Unsupported universe schema version: ${universe.schemaVersion}`);
  }
  const records = businessRecords(universe);
  const ids = new Set<string>();
  for (const record of records) {
    if (record.tenantId !== universe.tenant.id) {
      throw new Error(`${record.id} belongs to ${record.tenantId}, expected ${universe.tenant.id}.`);
    }
    if (ids.has(record.id)) throw new Error(`Duplicate business record id: ${record.id}`);
    ids.add(record.id);
  }
  const eventObjectIds = new Set(universe.sourceEvents.map((event) => event.objectId));
  for (const record of records) {
    if (!eventObjectIds.has(record.id)) throw new Error(`Missing source event for ${record.id}.`);
  }
  const entityIds = new Set([
    universe.tenant.id,
    ...universe.team.map((member) => member.id),
    ...durableRecords(universe).map((record) => record.id),
  ]);
  for (const relation of universe.relations) {
    if (!entityIds.has(relation.fromId) || !entityIds.has(relation.toId)) {
      throw new Error(`Relation ${relation.id} references a non-durable object.`);
    }
  }
}

function sourceReference(record: MemoryRecord) {
  return {
    source_type: record.trace.source,
    source_account_id: "default",
    source_id: record.trace.sourceId,
  };
}

type DeterministicSeedFact = {
  id: string;
  subjectKey: string;
  factType: "attribute" | "commercial" | "operational" | "metric" | "source-summary" | "decision";
  factKey: string;
  value: string | number | boolean;
  unit: string | null;
  confidence: number;
  observedAt: string;
  validFrom: string | null;
  validTo: string | null;
  source: BusinessRecord;
};

/**
 * Materialises the most useful, atomic assertions from the deterministic
 * universe. Source objects stay authoritative; each fact keeps the exact
 * source object/event used to assert it and can therefore be cited by OPS.
 */
function deterministicSeedFacts(universe: CompanyMemoryUniverse): DeterministicSeedFact[] {
  const facts: DeterministicSeedFact[] = [];
  const push = (
    source: BusinessRecord,
    subjectKey: string,
    factType: DeterministicSeedFact["factType"],
    key: string,
    value: DeterministicSeedFact["value"],
    unit: string | null = null,
    confidence = 1,
    validFrom: string | null = source.createdAt,
    validTo: string | null = null,
  ) => {
    facts.push({
      id: `FACT-${sha256(`${subjectKey}:${key}:${source.id}`).slice(0, 20).toUpperCase()}`,
      subjectKey,
      factType,
      factKey: key,
      value,
      unit,
      confidence,
      observedAt: source.updatedAt,
      validFrom,
      validTo,
      source,
    });
  };

  universe.clients.forEach((client) => {
    push(client, client.id, "attribute", "client.status", client.status);
    push(client, client.id, "attribute", "client.health_score", client.healthScore, "score/100");
  });

  universe.opportunities.forEach((opportunity) => {
    push(opportunity, opportunity.id, "commercial", "opportunity.stage", opportunity.stage);
    push(opportunity, opportunity.id, "commercial", "opportunity.amount", opportunity.amountCents / 100, "EUR");
    push(opportunity, opportunity.id, "commercial", "opportunity.probability", opportunity.probability, "percent");
    push(opportunity, opportunity.id, "commercial", "opportunity.next_step", opportunity.nextStep);
  });

  universe.projects.forEach((project) => {
    push(project, project.id, "operational", "project.status", project.status);
    push(project, project.id, "operational", "project.progress", project.progressPercent, "percent");
    push(project, project.id, "operational", "project.budget", project.budgetCents / 100, "EUR");
    if (project.riskSummary) {
      push(project, project.id, "operational", "project.risk_summary", project.riskSummary);
    }
  });

  const currentMonth = universe.generatedAt.slice(0, 7);
  universe.metrics
    .filter((item) => item.periodStart.startsWith(currentMonth) || item.periodStart === item.periodEnd)
    .forEach((item) => {
      push(
        item,
        universe.tenant.id,
        "metric",
        `metric.${item.domain}.${item.metric}.${item.periodStart}`,
        item.value,
        item.unit,
        1,
        item.periodStart,
        item.periodEnd,
      );
    });

  universe.documents
    .filter((document) => /^(?:ALERT-|SEO-SNAPSHOT-|FIN-SNAPSHOT-|CRM-SNAPSHOT-|GADS-|NTN-STRAT-)/.test(document.id))
    .forEach((document) => {
      push(document, document.id, "source-summary", `document.summary.${document.id}`, document.summary);
    });

  universe.decisions
    .filter((decision) => decision.status === "active")
    .forEach((decision) => {
      push(decision, decision.id, "decision", "decision.rationale", decision.rationale);
      push(decision, decision.id, "decision", "decision.outcome", decision.outcome);
    });

  return facts;
}

function decisionStatus(status: DecisionRecord["status"]) {
  if (status === "completed") return "implemented";
  if (status === "superseded") return "expired";
  return "decided";
}

function taskStatus(status: TaskRecord["status"]) {
  return status === "in-progress" ? "in_progress" : status;
}

function taskPriority(priority: TaskRecord["priority"]) {
  return priority === "high" ? 1 : priority === "low" ? 5 : 3;
}

const UPSERT_SOURCE_EVENTS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, source_type text, source_account_id text,
      source_id text, event_type text, occurred_at timestamptz, received_at timestamptz,
      schema_version integer, idempotency_key text, content_hash text, payload jsonb,
      processing_state text, processed_at timestamptz
    )
  )
  INSERT INTO ops_memory.source_events (
    id, organization_id, source_type, source_account_id, source_id, event_type,
    occurred_at, received_at, schema_version, idempotency_key, content_hash, payload,
    processing_state, processed_at
  )
  SELECT id, organization_id, source_type, source_account_id, source_id, event_type,
    occurred_at, received_at, schema_version, idempotency_key, content_hash, payload,
    processing_state, processed_at
  FROM incoming
  ON CONFLICT (organization_id, idempotency_key) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    source_account_id = EXCLUDED.source_account_id,
    source_id = EXCLUDED.source_id,
    event_type = EXCLUDED.event_type,
    occurred_at = EXCLUDED.occurred_at,
    schema_version = EXCLUDED.schema_version,
    content_hash = EXCLUDED.content_hash,
    payload = EXCLUDED.payload,
    processing_state = EXCLUDED.processing_state,
    processed_at = EXCLUDED.processed_at,
    deleted_at = NULL,
    updated_at = now()
`;

const UPSERT_SOURCE_OBJECTS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, source_type text, source_account_id text,
      source_id text, object_type text, title text, content_text text, content_json jsonb,
      metadata jsonb, source_url text, mime_type text, content_hash text,
      source_created_at timestamptz, source_updated_at timestamptz,
      last_event_key text, version integer, source_deleted_at timestamptz
    )
  )
  INSERT INTO ops_memory.source_objects (
    id, organization_id, source_type, source_account_id, source_id, object_type,
    title, content_text, content_json, metadata, source_url, mime_type, content_hash,
    source_created_at, source_updated_at, last_event_id, version, is_current,
    source_deleted_at
  )
  SELECT i.id, i.organization_id, i.source_type, i.source_account_id, i.source_id,
    i.object_type, i.title, i.content_text, i.content_json, i.metadata, i.source_url,
    i.mime_type, i.content_hash, i.source_created_at, i.source_updated_at, e.id,
    i.version, i.source_deleted_at IS NULL, i.source_deleted_at
  FROM incoming i
  LEFT JOIN ops_memory.source_events e
    ON e.organization_id = i.organization_id AND e.idempotency_key = i.last_event_key
  ON CONFLICT (organization_id, source_type, source_account_id, source_id) DO UPDATE SET
    object_type = EXCLUDED.object_type,
    title = EXCLUDED.title,
    content_text = EXCLUDED.content_text,
    content_json = EXCLUDED.content_json,
    metadata = EXCLUDED.metadata,
    source_url = EXCLUDED.source_url,
    mime_type = EXCLUDED.mime_type,
    content_hash = EXCLUDED.content_hash,
    source_created_at = EXCLUDED.source_created_at,
    source_updated_at = EXCLUDED.source_updated_at,
    last_event_id = EXCLUDED.last_event_id,
    version = EXCLUDED.version,
    is_current = EXCLUDED.is_current,
    source_deleted_at = EXCLUDED.source_deleted_at,
    deleted_at = NULL,
    updated_at = now()
`;

const UPSERT_ENTITIES_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, entity_type text, canonical_key text,
      display_name text, summary text, attributes jsonb, confidence numeric,
      observed_at timestamptz, valid_from timestamptz,
      source_type text, source_account_id text, source_id text
    )
  )
  INSERT INTO ops_memory.entities AS current_entity (
    id, organization_id, entity_type, canonical_key, display_name, summary,
    attributes, confidence, source_object_id, source_event_id, first_seen_at,
    last_seen_at, valid_from
  )
  SELECT i.id, i.organization_id, i.entity_type, i.canonical_key, i.display_name,
    i.summary, i.attributes, i.confidence, so.id, so.last_event_id, i.valid_from,
    i.observed_at, i.valid_from
  FROM incoming i
  LEFT JOIN ops_memory.source_objects so
    ON so.organization_id = i.organization_id
    AND so.source_type = i.source_type
    AND so.source_account_id = i.source_account_id
    AND so.source_id = i.source_id
  ON CONFLICT (organization_id, entity_type, canonical_key) WHERE deleted_at IS NULL
  DO UPDATE SET
    display_name = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN current_entity.display_name ELSE EXCLUDED.display_name END,
    summary = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN current_entity.summary ELSE EXCLUDED.summary END,
    attributes = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN EXCLUDED.attributes || current_entity.attributes ELSE EXCLUDED.attributes END,
    confidence = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN current_entity.confidence ELSE EXCLUDED.confidence END,
    source_object_id = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN current_entity.source_object_id ELSE EXCLUDED.source_object_id END,
    source_event_id = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN current_entity.source_event_id ELSE EXCLUDED.source_event_id END,
    last_seen_at = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN GREATEST(current_entity.last_seen_at, EXCLUDED.last_seen_at) ELSE EXCLUDED.last_seen_at END,
    valid_from = CASE WHEN EXISTS (
      SELECT 1 FROM ops_memory.source_objects controlled_source
      WHERE controlled_source.id = current_entity.source_object_id
        AND controlled_source.source_type = 'ops_action'
    ) THEN current_entity.valid_from ELSE EXCLUDED.valid_from END,
    deleted_at = NULL,
    updated_at = now()
`;

const UPSERT_RELATIONS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, subject_key text, predicate text,
      object_key text, properties jsonb, confidence numeric, evidence_text text,
      observed_at timestamptz, valid_from timestamptz, valid_to timestamptz,
      evidence_source_type text, evidence_source_account_id text, evidence_source_id text
    )
  )
  INSERT INTO ops_memory.relations (
    id, organization_id, subject_entity_id, predicate, object_entity_id, properties,
    confidence, source_object_id, source_event_id, evidence_text, observed_at,
    valid_from, valid_to
  )
  SELECT i.id, i.organization_id, subject.id, i.predicate, object.id, i.properties,
    i.confidence, evidence.id, evidence.last_event_id, i.evidence_text,
    i.observed_at, i.valid_from, i.valid_to
  FROM incoming i
  JOIN ops_memory.entities subject
    ON subject.organization_id = i.organization_id AND subject.canonical_key = i.subject_key
    AND subject.deleted_at IS NULL
  JOIN ops_memory.entities object
    ON object.organization_id = i.organization_id AND object.canonical_key = i.object_key
    AND object.deleted_at IS NULL
  LEFT JOIN ops_memory.source_objects evidence
    ON evidence.organization_id = i.organization_id
    AND evidence.source_type = i.evidence_source_type
    AND evidence.source_account_id = i.evidence_source_account_id
    AND evidence.source_id = i.evidence_source_id
  ON CONFLICT (organization_id, subject_entity_id, predicate, object_entity_id)
    WHERE deleted_at IS NULL
  DO UPDATE SET
    properties = EXCLUDED.properties,
    confidence = EXCLUDED.confidence,
    source_object_id = EXCLUDED.source_object_id,
    source_event_id = EXCLUDED.source_event_id,
    evidence_text = EXCLUDED.evidence_text,
    observed_at = EXCLUDED.observed_at,
    valid_from = EXCLUDED.valid_from,
    valid_to = EXCLUDED.valid_to,
    deleted_at = NULL,
    updated_at = now()
`;

const UPSERT_FACTS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, subject_key text, fact_type text,
      fact_key text, value_text text, value_number numeric, value_boolean boolean,
      value_date timestamptz, value_json jsonb, unit text, confidence numeric,
      status text, observed_at timestamptz, valid_from timestamptz,
      valid_to timestamptz, source_type text, source_account_id text,
      source_id text, confidentiality text
    )
  )
  INSERT INTO ops_memory.facts (
    id, organization_id, subject_entity_id, fact_type, fact_key,
    value_text, value_number, value_boolean, value_date, value_json, unit,
    confidence, status, observed_at, valid_from, valid_to, source_event_id,
    source_object_id, confidentiality
  )
  SELECT i.id, i.organization_id, subject.id, i.fact_type, i.fact_key,
    i.value_text, i.value_number, i.value_boolean, i.value_date, i.value_json,
    i.unit, i.confidence, i.status, i.observed_at, i.valid_from, i.valid_to,
    source.last_event_id, source.id, i.confidentiality
  FROM incoming i
  JOIN ops_memory.entities subject
    ON subject.organization_id = i.organization_id
    AND subject.canonical_key = i.subject_key
    AND subject.deleted_at IS NULL
  JOIN ops_memory.source_objects source
    ON source.organization_id = i.organization_id
    AND source.source_type = i.source_type
    AND source.source_account_id = i.source_account_id
    AND source.source_id = i.source_id
    AND source.deleted_at IS NULL
  ON CONFLICT (id) DO UPDATE SET
    subject_entity_id = EXCLUDED.subject_entity_id,
    fact_type = EXCLUDED.fact_type,
    fact_key = EXCLUDED.fact_key,
    value_text = EXCLUDED.value_text,
    value_number = EXCLUDED.value_number,
    value_boolean = EXCLUDED.value_boolean,
    value_date = EXCLUDED.value_date,
    value_json = EXCLUDED.value_json,
    unit = EXCLUDED.unit,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    observed_at = EXCLUDED.observed_at,
    valid_from = EXCLUDED.valid_from,
    valid_to = EXCLUDED.valid_to,
    source_event_id = EXCLUDED.source_event_id,
    source_object_id = EXCLUDED.source_object_id,
    confidentiality = EXCLUDED.confidentiality,
    deleted_at = NULL,
    updated_at = now()
`;

const UPSERT_METRICS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, entity_key text, metric_key text,
      value numeric, unit text, dimensions jsonb, dimensions_hash text,
      observed_at timestamptz, period_start timestamptz, period_end timestamptz,
      granularity text, source_type text, source_account_id text, source_id text
    )
  )
  INSERT INTO ops_memory.metric_observations (
    id, organization_id, entity_id, metric_key, value, unit, dimensions,
    dimensions_hash, observed_at, period_start, period_end, granularity,
    source_object_id, source_event_id
  )
  SELECT i.id, i.organization_id, entity.id, i.metric_key, i.value, i.unit,
    i.dimensions, i.dimensions_hash, i.observed_at, i.period_start, i.period_end,
    i.granularity, source.id, source.last_event_id
  FROM incoming i
  LEFT JOIN ops_memory.entities entity
    ON entity.organization_id = i.organization_id AND entity.canonical_key = i.entity_key
    AND entity.deleted_at IS NULL
  LEFT JOIN ops_memory.source_objects source
    ON source.organization_id = i.organization_id
    AND source.source_type = i.source_type
    AND source.source_account_id = i.source_account_id
    AND source.source_id = i.source_id
  ON CONFLICT (organization_id, metric_key,
    COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    observed_at, dimensions_hash) WHERE deleted_at IS NULL
  DO UPDATE SET
    value = EXCLUDED.value,
    unit = EXCLUDED.unit,
    dimensions = EXCLUDED.dimensions,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    granularity = EXCLUDED.granularity,
    source_object_id = EXCLUDED.source_object_id,
    source_event_id = EXCLUDED.source_event_id,
    deleted_at = NULL,
    updated_at = now()
`;

const UPSERT_COMMITMENTS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, external_key text, title text, description text,
      status text, debtor_key text, beneficiary_key text, project_key text,
      committed_at timestamptz, due_at timestamptz, completed_at timestamptz,
      confidence numeric, source_type text, source_account_id text, source_id text
    )
  )
  INSERT INTO ops_memory.commitments (
    id, organization_id, external_key, title, description, status,
    debtor_entity_id, beneficiary_entity_id, project_entity_id, committed_at,
    due_at, completed_at, confidence, source_object_id, source_event_id
  )
  SELECT i.id, i.organization_id, i.external_key, i.title, i.description, i.status,
    debtor.id, beneficiary.id, project.id, i.committed_at, i.due_at, i.completed_at,
    i.confidence, source.id, source.last_event_id
  FROM incoming i
  LEFT JOIN ops_memory.entities debtor
    ON debtor.organization_id = i.organization_id AND debtor.canonical_key = i.debtor_key AND debtor.deleted_at IS NULL
  LEFT JOIN ops_memory.entities beneficiary
    ON beneficiary.organization_id = i.organization_id AND beneficiary.canonical_key = i.beneficiary_key AND beneficiary.deleted_at IS NULL
  LEFT JOIN ops_memory.entities project
    ON project.organization_id = i.organization_id AND project.canonical_key = i.project_key AND project.deleted_at IS NULL
  LEFT JOIN ops_memory.source_objects source
    ON source.organization_id = i.organization_id AND source.source_type = i.source_type
    AND source.source_account_id = i.source_account_id AND source.source_id = i.source_id
  ON CONFLICT (organization_id, external_key) WHERE external_key IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
    status = EXCLUDED.status, debtor_entity_id = EXCLUDED.debtor_entity_id,
    beneficiary_entity_id = EXCLUDED.beneficiary_entity_id,
    project_entity_id = EXCLUDED.project_entity_id, committed_at = EXCLUDED.committed_at,
    due_at = EXCLUDED.due_at, completed_at = EXCLUDED.completed_at,
    confidence = EXCLUDED.confidence, source_object_id = EXCLUDED.source_object_id,
    source_event_id = EXCLUDED.source_event_id, deleted_at = NULL, updated_at = now()
`;

const UPSERT_DECISIONS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, external_key text, title text, summary text,
      rationale text, outcome text, status text, decided_at timestamptz,
      effective_at timestamptz, owner_key text, project_key text, meeting_key text,
      source_type text, source_account_id text, source_id text
    )
  )
  INSERT INTO ops_memory.decisions (
    id, organization_id, external_key, title, summary, rationale, outcome, status,
    decided_at, effective_at, owner_entity_id, project_entity_id, meeting_entity_id,
    source_object_id, source_event_id
  )
  SELECT i.id, i.organization_id, i.external_key, i.title, i.summary, i.rationale,
    i.outcome, i.status, i.decided_at, i.effective_at, owner.id, project.id,
    meeting.id, source.id, source.last_event_id
  FROM incoming i
  LEFT JOIN ops_memory.entities owner
    ON owner.organization_id = i.organization_id AND owner.canonical_key = i.owner_key AND owner.deleted_at IS NULL
  LEFT JOIN ops_memory.entities project
    ON project.organization_id = i.organization_id AND project.canonical_key = i.project_key AND project.deleted_at IS NULL
  LEFT JOIN ops_memory.entities meeting
    ON meeting.organization_id = i.organization_id AND meeting.canonical_key = i.meeting_key AND meeting.deleted_at IS NULL
  LEFT JOIN ops_memory.source_objects source
    ON source.organization_id = i.organization_id AND source.source_type = i.source_type
    AND source.source_account_id = i.source_account_id AND source.source_id = i.source_id
  ON CONFLICT (organization_id, external_key) WHERE external_key IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
    rationale = EXCLUDED.rationale, outcome = EXCLUDED.outcome, status = EXCLUDED.status,
    decided_at = EXCLUDED.decided_at, effective_at = EXCLUDED.effective_at,
    owner_entity_id = EXCLUDED.owner_entity_id, project_entity_id = EXCLUDED.project_entity_id,
    meeting_entity_id = EXCLUDED.meeting_entity_id, source_object_id = EXCLUDED.source_object_id,
    source_event_id = EXCLUDED.source_event_id, deleted_at = NULL, updated_at = now()
`;

const UPSERT_TASKS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, external_key text, title text, description text,
      status text, priority smallint, assigned_key text, related_key text,
      decision_key text, due_at timestamptz, completed_at timestamptz,
      source_type text, source_account_id text, source_id text
    )
  )
  INSERT INTO ops_memory.tasks (
    id, organization_id, external_key, title, description, status, priority,
    assigned_entity_id, related_entity_id, decision_id, due_at, completed_at,
    source_object_id, source_event_id
  )
  SELECT i.id, i.organization_id, i.external_key, i.title, i.description, i.status,
    i.priority, assigned.id, related.id, decision.id, i.due_at, i.completed_at,
    source.id, source.last_event_id
  FROM incoming i
  LEFT JOIN ops_memory.entities assigned
    ON assigned.organization_id = i.organization_id AND assigned.canonical_key = i.assigned_key AND assigned.deleted_at IS NULL
  LEFT JOIN ops_memory.entities related
    ON related.organization_id = i.organization_id AND related.canonical_key = i.related_key AND related.deleted_at IS NULL
  LEFT JOIN ops_memory.decisions decision
    ON decision.organization_id = i.organization_id AND decision.external_key = i.decision_key AND decision.deleted_at IS NULL
  LEFT JOIN ops_memory.source_objects source
    ON source.organization_id = i.organization_id AND source.source_type = i.source_type
    AND source.source_account_id = i.source_account_id AND source.source_id = i.source_id
  ON CONFLICT (organization_id, external_key) WHERE external_key IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
    status = EXCLUDED.status, priority = EXCLUDED.priority,
    assigned_entity_id = EXCLUDED.assigned_entity_id, related_entity_id = EXCLUDED.related_entity_id,
    decision_id = EXCLUDED.decision_id, due_at = EXCLUDED.due_at,
    completed_at = EXCLUDED.completed_at, source_object_id = EXCLUDED.source_object_id,
    source_event_id = EXCLUDED.source_event_id, deleted_at = NULL, updated_at = now()
`;

const UPSERT_DOCUMENTS_SQL = `
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid, organization_id uuid, storage_provider text, storage_key text,
      file_name text, title text, document_type text, mime_type text, byte_size bigint,
      sha256 text, version integer, related_key text, extracted_text text,
      metadata jsonb, source_type text, source_account_id text, source_id text
    )
  )
  INSERT INTO ops_memory.documents (
    id, organization_id, storage_provider, storage_key, file_name, title,
    document_type, mime_type, byte_size, sha256, version, related_entity_id,
    extraction_status, extracted_text, metadata, source_object_id
  )
  SELECT i.id, i.organization_id, i.storage_provider, i.storage_key, i.file_name,
    i.title, i.document_type, i.mime_type, i.byte_size, i.sha256, i.version,
    related.id, 'ready', i.extracted_text, i.metadata, source.id
  FROM incoming i
  LEFT JOIN ops_memory.entities related
    ON related.organization_id = i.organization_id AND related.canonical_key = i.related_key AND related.deleted_at IS NULL
  LEFT JOIN ops_memory.source_objects source
    ON source.organization_id = i.organization_id AND source.source_type = i.source_type
    AND source.source_account_id = i.source_account_id AND source.source_id = i.source_id
  ON CONFLICT (organization_id, storage_provider, storage_key) DO UPDATE SET
    file_name = EXCLUDED.file_name, title = EXCLUDED.title,
    document_type = EXCLUDED.document_type, mime_type = EXCLUDED.mime_type,
    byte_size = EXCLUDED.byte_size, sha256 = EXCLUDED.sha256, version = EXCLUDED.version,
    related_entity_id = EXCLUDED.related_entity_id, extraction_status = EXCLUDED.extraction_status,
    extracted_text = EXCLUDED.extracted_text, metadata = EXCLUDED.metadata,
    source_object_id = EXCLUDED.source_object_id, deleted_at = NULL, updated_at = now()
`;

/**
 * Loads the deterministic Atelier Beaumarchais universe into PostgreSQL.
 *
 * The whole import is atomic. Raw source events/objects are retained, while
 * durable business objects become entities. Individual email messages remain
 * source objects and therefore do not pollute the knowledge graph.
 */
export async function loadAtelierUniverseToCentralMemory(
  pool: UniverseLoaderPool,
  universe: CompanyMemoryUniverse,
  options: UniverseLoaderOptions = {},
): Promise<UniverseLoadResult> {
  validateUniverse(universe);
  const batchSize = Math.min(1_000, Math.max(25, options.batchSize ?? DEFAULT_BATCH_SIZE));
  const sourceAccountId = options.sourceAccountId?.trim() || "default";
  const slug = organizationSlug(universe);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const organizationResult = await client.query<{ id: string }>(`
      INSERT INTO ops_memory.organizations (id, slug, display_name, timezone, settings)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (slug) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        timezone = EXCLUDED.timezone,
        settings = ops_memory.organizations.settings || EXCLUDED.settings,
        deleted_at = NULL,
        updated_at = now()
      RETURNING id
    `, [
      deterministicMemoryUuid(`organization:${universe.tenant.id}`),
      slug,
      universe.tenant.name,
      universe.tenant.timezone,
      JSON.stringify({
        currency: universe.tenant.currency,
        externalTenantId: universe.tenant.id,
        datasetSeed: universe.seed,
        datasetGeneratedAt: universe.generatedAt,
        schemaVersion: universe.schemaVersion,
      }),
    ]);
    const organizationId = organizationResult.rows[0]?.id;
    if (!organizationId) throw new Error("Organization upsert did not return an id.");

    const eventByObjectId = new Map(universe.sourceEvents.map((event) => [event.objectId, event]));
    const recordById = new Map(businessRecords(universe).map((record) => [record.id, record]));

    const sourceEventRows = universe.sourceEvents.map((event) => {
      const idempotencyKey = eventIdempotencyKey(universe, event.id, event.trace.checksum);
      return {
        id: deterministicMemoryUuid(`${organizationId}:source-event:${idempotencyKey}`),
        organization_id: organizationId,
        source_type: event.trace.source,
        source_account_id: sourceAccountId,
        source_id: event.trace.sourceId,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        received_at: event.trace.ingestedAt,
        schema_version: 1,
        idempotency_key: idempotencyKey,
        content_hash: event.trace.checksum,
        payload: {
          ...event.payload,
          externalEventId: event.id,
          externalObjectId: event.objectId,
          objectType: event.objectType,
          confidentiality: event.confidentiality,
          trace: event.trace,
        },
        processing_state: "processed",
        processed_at: event.trace.ingestedAt,
      };
    });
    await batchJson(client, UPSERT_SOURCE_EVENTS_SQL, sourceEventRows, batchSize);

    const sourceObjectRows = businessRecords(universe).map((record) => {
      const event = eventByObjectId.get(record.id);
      if (!event) throw new Error(`Missing source event for ${record.id}.`);
      return {
        id: deterministicMemoryUuid(`${organizationId}:source-object:${record.trace.source}:${sourceAccountId}:${record.trace.sourceId}`),
        organization_id: organizationId,
        source_type: record.trace.source,
        source_account_id: sourceAccountId,
        source_id: record.trace.sourceId,
        object_type: record.kind,
        title: record.kind === "email-message" ? record.subject : record.kind === "metric" ? `${record.domain} · ${record.metric}` : displayName(record),
        content_text: searchableText(record),
        content_json: record,
        metadata: {
          externalId: record.id,
          tenantId: record.tenantId,
          confidentiality: record.confidentiality,
          trace: record.trace,
          datasetSeed: universe.seed,
        },
        source_url: record.trace.sourceUrl ?? null,
        mime_type: record.kind === "document" ? record.mimeType : "application/json",
        content_hash: record.trace.checksum,
        source_created_at: record.createdAt,
        source_updated_at: record.trace.sourceUpdatedAt,
        last_event_key: eventIdempotencyKey(universe, event.id, event.trace.checksum),
        version: record.version,
        source_deleted_at: record.deletedAt,
      };
    });
    await batchJson(client, UPSERT_SOURCE_OBJECTS_SQL, sourceObjectRows, batchSize);

    const entityRows: Record<string, unknown>[] = [
      {
        id: deterministicMemoryUuid(`${organizationId}:entity:organization:${universe.tenant.id}`),
        organization_id: organizationId,
        entity_type: "organization",
        canonical_key: universe.tenant.id,
        display_name: universe.tenant.name,
        summary: "Mémoire centrale de l’entreprise.",
        attributes: { ...universe.tenant, datasetSeed: universe.seed },
        confidence: 1,
        observed_at: universe.generatedAt,
        valid_from: universe.generatedAt,
        source_type: null,
        source_account_id: null,
        source_id: null,
      },
      ...universe.team.map((member) => ({
        id: deterministicMemoryUuid(`${organizationId}:entity:team-member:${member.id}`),
        organization_id: organizationId,
        entity_type: "team-member",
        canonical_key: member.id,
        display_name: member.name,
        summary: `${member.role} · ${member.email}`,
        attributes: member,
        confidence: 1,
        observed_at: universe.generatedAt,
        valid_from: universe.generatedAt,
        source_type: null,
        source_account_id: null,
        source_id: null,
      })),
      ...durableRecords(universe).map((record) => ({
        id: deterministicMemoryUuid(`${organizationId}:entity:${record.kind}:${record.id}`),
        organization_id: organizationId,
        entity_type: record.kind,
        canonical_key: record.id,
        display_name: displayName(record),
        summary: recordSummary(record),
        attributes: record,
        confidence: 1,
        observed_at: record.updatedAt,
        valid_from: record.createdAt,
        source_type: record.trace.source,
        source_account_id: sourceAccountId,
        source_id: record.trace.sourceId,
      })),
    ];
    await batchJson(client, UPSERT_ENTITIES_SQL, entityRows, batchSize);

    const relationRows = universe.relations.map((relation) => {
      const evidence = relation.evidenceIds.map((id) => recordById.get(id)).find(Boolean);
      return {
        id: deterministicMemoryUuid(`${organizationId}:relation:${relation.id}`),
        organization_id: organizationId,
        subject_key: relation.fromId,
        predicate: relation.relation,
        object_key: relation.toId,
        properties: {
          externalId: relation.id,
          evidenceIds: relation.evidenceIds,
          trace: relation.trace,
        },
        confidence: relation.confidence,
        evidence_text: relation.evidenceIds.length > 0 ? `Preuves : ${relation.evidenceIds.join(", ")}` : null,
        observed_at: relation.updatedAt,
        valid_from: relation.validFrom,
        valid_to: relation.validTo,
        evidence_source_type: evidence?.trace.source ?? null,
        evidence_source_account_id: evidence ? sourceAccountId : null,
        evidence_source_id: evidence?.trace.sourceId ?? null,
      };
    });
    await batchJson(client, UPSERT_RELATIONS_SQL, relationRows, batchSize);

    const factRows = deterministicSeedFacts(universe).map((fact) => ({
      id: deterministicMemoryUuid(`${organizationId}:fact:${fact.id}`),
      organization_id: organizationId,
      subject_key: fact.subjectKey,
      fact_type: fact.factType,
      fact_key: fact.factKey,
      value_text: typeof fact.value === "string" ? fact.value : null,
      value_number: typeof fact.value === "number" ? fact.value : null,
      value_boolean: typeof fact.value === "boolean" ? fact.value : null,
      value_date: null,
      value_json: null,
      unit: fact.unit,
      confidence: fact.confidence,
      status: "asserted",
      observed_at: fact.observedAt,
      valid_from: fact.validFrom,
      valid_to: fact.validTo,
      source_type: fact.source.trace.source,
      source_account_id: sourceAccountId,
      source_id: fact.source.trace.sourceId,
      confidentiality: fact.source.confidentiality,
    }));
    await batchJson(client, UPSERT_FACTS_SQL, factRows, batchSize);

    const metricRows = universe.metrics.map((metric) => {
      const dimensions = {
        ...metric.dimensions,
        externalId: metric.id,
        domain: metric.domain,
      };
      return {
        id: deterministicMemoryUuid(`${organizationId}:metric:${metric.id}`),
        organization_id: organizationId,
        entity_key: universe.tenant.id,
        metric_key: `${metric.domain}.${metric.metric}`,
        value: metric.value,
        unit: metric.unit,
        dimensions,
        dimensions_hash: sha256(stableJson(dimensions)),
        observed_at: metric.updatedAt,
        period_start: metric.periodStart,
        period_end: metric.periodEnd,
        granularity: metric.periodStart === metric.periodEnd ? "day" : "month",
        ...sourceReference(metric),
        source_account_id: sourceAccountId,
      };
    });
    await batchJson(client, UPSERT_METRICS_SQL, metricRows, batchSize);

    const commitmentRows = universe.commitments.map((commitment) => ({
      id: deterministicMemoryUuid(`${organizationId}:commitment:${commitment.id}`),
      organization_id: organizationId,
      external_key: commitment.id,
      title: commitment.description.slice(0, 240),
      description: commitment.description,
      status: commitment.status === "kept" ? "fulfilled" : commitment.status === "late" ? "overdue" : commitment.status,
      debtor_key: commitment.committedBy === "company" ? universe.tenant.id : commitment.contactId,
      beneficiary_key: commitment.committedBy === "company" ? commitment.contactId : universe.tenant.id,
      project_key: commitment.projectId,
      committed_at: commitment.committedOn,
      due_at: commitment.dueOn,
      completed_at: commitment.status === "kept" ? commitment.updatedAt : null,
      confidence: 1,
      ...sourceReference(commitment),
      source_account_id: sourceAccountId,
    }));
    await batchJson(client, UPSERT_COMMITMENTS_SQL, commitmentRows, batchSize);

    const decisionRows = universe.decisions.map((decision) => ({
      id: deterministicMemoryUuid(`${organizationId}:decision:${decision.id}`),
      organization_id: organizationId,
      external_key: decision.id,
      title: decision.title,
      summary: decision.outcome,
      rationale: decision.rationale,
      outcome: decision.outcome,
      status: decisionStatus(decision.status),
      decided_at: decision.decidedOn,
      effective_at: decision.decidedOn,
      owner_key: decision.decidedByIds[0] ?? universe.tenant.id,
      project_key: decision.projectId,
      meeting_key: decision.sourceMeetingId,
      ...sourceReference(decision),
      source_account_id: sourceAccountId,
    }));
    await batchJson(client, UPSERT_DECISIONS_SQL, decisionRows, batchSize);

    const taskRows = universe.tasks.map((task) => ({
      id: deterministicMemoryUuid(`${organizationId}:task:${task.id}`),
      organization_id: organizationId,
      external_key: task.id,
      title: task.title,
      description: task.description,
      status: taskStatus(task.status),
      priority: taskPriority(task.priority),
      assigned_key: task.ownerId,
      related_key: task.projectId ?? task.opportunityId ?? task.clientId ?? universe.tenant.id,
      decision_key: task.sourceDecisionId,
      due_at: task.dueOn,
      completed_at: task.completedAt,
      ...sourceReference(task),
      source_account_id: sourceAccountId,
    }));
    await batchJson(client, UPSERT_TASKS_SQL, taskRows, batchSize);

    const documentRows = universe.documents.map((document) => ({
      id: deterministicMemoryUuid(`${organizationId}:document:${document.id}`),
      organization_id: organizationId,
      storage_provider: document.trace.source,
      storage_key: document.storageKey,
      file_name: document.storageKey.split("/").at(-1) ?? `${document.id}.bin`,
      title: document.title,
      document_type: document.documentType,
      mime_type: document.mimeType,
      byte_size: document.sizeBytes,
      sha256: document.sha256,
      version: document.version,
      related_key: document.projectId ?? document.clientId ?? universe.tenant.id,
      extracted_text: document.summary,
      metadata: {
        externalId: document.id,
        clientId: document.clientId,
        projectId: document.projectId,
        confidentiality: document.confidentiality,
        trace: document.trace,
      },
      ...sourceReference(document),
      source_account_id: sourceAccountId,
    }));
    await batchJson(client, UPSERT_DOCUMENTS_SQL, documentRows, batchSize);

    const counts: UniverseLoadCounts = {
      organizations: 1,
      sourceEvents: sourceEventRows.length,
      sourceObjects: sourceObjectRows.length,
      entities: entityRows.length,
      relations: relationRows.length,
      facts: factRows.length,
      metricObservations: metricRows.length,
      commitments: commitmentRows.length,
      decisions: decisionRows.length,
      tasks: taskRows.length,
      documents: documentRows.length,
    };
    await client.query(`
      INSERT INTO ops_memory.audit_logs (
        organization_id, occurred_at, actor_type, actor_id, action,
        resource_type, resource_id, after_state, metadata
      )
      SELECT $1, $2, 'system', 'atelier-universe-loader', 'universe.loaded',
        'organization', $5, $3::jsonb, $4::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM ops_memory.audit_logs
        WHERE organization_id = $1
          AND actor_id = 'atelier-universe-loader'
          AND action = 'universe.loaded'
          AND metadata->>'seed' = ($4::jsonb)->>'seed'
          AND metadata->>'schemaVersion' = ($4::jsonb)->>'schemaVersion'
      )
    `, [
      organizationId,
      universe.generatedAt,
      JSON.stringify({ counts }),
      JSON.stringify({ seed: universe.seed, schemaVersion: universe.schemaVersion }),
      organizationId,
    ]);

    await client.query("COMMIT");
    return {
      organizationId,
      organizationSlug: slug,
      dataset: {
        seed: universe.seed,
        generatedAt: universe.generatedAt,
        schemaVersion: universe.schemaVersion,
      },
      counts,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original import failure.
    }
    throw error;
  } finally {
    client.release();
  }
}
