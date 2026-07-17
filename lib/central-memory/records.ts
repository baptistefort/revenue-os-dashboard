import type { QueryResultRow } from "pg";
import {
  getCentralMemoryPool,
  type SqlQueryable,
} from "@/lib/central-memory/database";

export const centralUiRecordKinds = [
  "email",
  "opportunity",
  "task",
  "client",
] as const;

export type CentralUiRecordKind = (typeof centralUiRecordKinds)[number];

export type CentralUiRecord = {
  id: string;
  title: string;
  summary: string;
  type: "document" | "project" | "client";
  path: string;
  createdAt: string;
  attributes: Record<string, string | number | boolean | null | Array<string | number | boolean>>;
  relations: string[];
  content: string;
};

type SourceObjectRow = QueryResultRow & {
  source_id: string;
  object_type: string;
  title: string | null;
  content_text: string | null;
  content_json: unknown;
  metadata: unknown;
  source_type: string;
  source_created_at: string | Date | null;
  source_updated_at: string | Date | null;
  created_at: string | Date;
  client_name: string | null;
  owner_name: string | null;
  project_name: string | null;
  sender_name: string | null;
  primary_contact_email: string | null;
  revenue_cents: string | number | null;
  margin_percent: string | number | null;
  last_interaction_at: string | Date | null;
  next_opportunity: string | null;
};

type OrganizationRow = QueryResultRow & { id: string };

const limits: Record<CentralUiRecordKind, number> = {
  email: 80,
  opportunity: 100,
  task: 250,
  client: 100,
};

const objectTypes: Record<CentralUiRecordKind, string[]> = {
  email: ["email-message", "email", "email_draft"],
  opportunity: ["opportunity"],
  task: ["task"],
  client: ["client"],
};

const RECORDS_SQL = `
  WITH target AS (
    SELECT source.*
    FROM ops_memory.source_objects source
    WHERE source.organization_id = $1
      AND source.object_type = ANY($2::text[])
      AND source.is_current = true
      AND source.deleted_at IS NULL
      AND source.source_deleted_at IS NULL
      AND (
        $5::text IS NULL
        OR upper(COALESCE(
          source.content_json ->> 'id',
          source.metadata ->> 'externalId',
          source.source_id
        )) = upper($5)
      )
      AND COALESCE(source.content_json ->> 'archived', 'false') <> 'true'
      AND COALESCE(source.content_json ->> 'status', '') <> 'archived'
      AND (
        $4 <> 'opportunity'
        OR COALESCE(source.content_json ->> 'stage', '') NOT IN ('won', 'lost')
      )
      AND (
        $4 <> 'task'
        OR COALESCE(source.content_json ->> 'status', '') NOT IN ('done', 'cancelled')
      )
    ORDER BY
      COALESCE(source.source_updated_at, source.source_created_at, source.created_at) DESC,
      source.source_id DESC
    LIMIT $3
  )
  SELECT
    source.source_id,
    source.object_type,
    source.title,
    source.content_text,
    source.content_json,
    source.metadata,
    source.source_type,
    source.source_created_at,
    source.source_updated_at,
    source.created_at,
    client.display_name AS client_name,
    owner.display_name AS owner_name,
    project.display_name AS project_name,
    sender_contact.display_name AS sender_name,
    primary_contact.attributes ->> 'email' AS primary_contact_email,
    client_finance.revenue_cents,
    client_finance.margin_percent,
    client_activity.last_interaction_at,
    client_pipeline.next_opportunity
  FROM target source
  LEFT JOIN ops_memory.entities client
    ON client.organization_id = source.organization_id
    AND client.entity_type = 'client'
    AND client.canonical_key = source.content_json ->> 'clientId'
    AND client.deleted_at IS NULL
  LEFT JOIN ops_memory.entities owner
    ON owner.organization_id = source.organization_id
    AND owner.entity_type = 'team-member'
    AND owner.canonical_key = COALESCE(
      source.content_json ->> 'ownerId',
      source.content_json ->> 'accountOwnerId'
    )
    AND owner.deleted_at IS NULL
  LEFT JOIN ops_memory.entities project
    ON project.organization_id = source.organization_id
    AND project.entity_type = 'project'
    AND project.canonical_key = source.content_json ->> 'projectId'
    AND project.deleted_at IS NULL
  LEFT JOIN ops_memory.entities sender_contact
    ON sender_contact.organization_id = source.organization_id
    AND sender_contact.entity_type = 'contact'
    AND sender_contact.attributes ->> 'email' = source.content_json ->> 'sender'
    AND sender_contact.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT contact.attributes
    FROM ops_memory.entities contact
    WHERE source.object_type = 'client'
      AND contact.organization_id = source.organization_id
      AND contact.entity_type = 'contact'
      AND contact.attributes ->> 'clientId' = source.content_json ->> 'id'
      AND contact.deleted_at IS NULL
    ORDER BY
      CASE WHEN contact.attributes ->> 'isDecisionMaker' = 'true' THEN 0 ELSE 1 END,
      contact.display_name
    LIMIT 1
  ) primary_contact ON source.object_type = 'client'
  LEFT JOIN LATERAL (
    SELECT
      (
        SELECT COALESCE(SUM((invoice.content_json ->> 'amountExcludingTaxCents')::numeric), 0)
        FROM ops_memory.source_objects invoice
        WHERE source.object_type = 'client'
          AND invoice.organization_id = source.organization_id
          AND invoice.object_type = 'invoice'
          AND invoice.content_json ->> 'clientId' = source.content_json ->> 'id'
          AND invoice.is_current = true
          AND invoice.deleted_at IS NULL
          AND invoice.source_deleted_at IS NULL
      ) AS revenue_cents,
      (
        SELECT ROUND(
          100 * SUM(
            (project_source.content_json ->> 'budgetCents')::numeric
            - (project_source.content_json ->> 'costBudgetCents')::numeric
          ) / NULLIF(SUM((project_source.content_json ->> 'budgetCents')::numeric), 0),
          1
        )
        FROM ops_memory.source_objects project_source
        WHERE source.object_type = 'client'
          AND project_source.organization_id = source.organization_id
          AND project_source.object_type = 'project'
          AND project_source.content_json ->> 'clientId' = source.content_json ->> 'id'
          AND project_source.is_current = true
          AND project_source.deleted_at IS NULL
          AND project_source.source_deleted_at IS NULL
      ) AS margin_percent
  ) client_finance ON source.object_type = 'client'
  LEFT JOIN LATERAL (
    SELECT MAX((email.content_json ->> 'sentAt')::timestamptz) AS last_interaction_at
    FROM ops_memory.source_objects email
    WHERE source.object_type = 'client'
      AND email.organization_id = source.organization_id
      AND email.object_type = 'email-message'
      AND email.content_json ->> 'clientId' = source.content_json ->> 'id'
      AND email.is_current = true
      AND email.deleted_at IS NULL
      AND email.source_deleted_at IS NULL
  ) client_activity ON source.object_type = 'client'
  LEFT JOIN LATERAL (
    SELECT CONCAT(
      opportunity.content_json ->> 'name',
      ' · ',
      ROUND((opportunity.content_json ->> 'amountCents')::numeric / 1000),
      ' K€'
    ) AS next_opportunity
    FROM ops_memory.source_objects opportunity
    WHERE source.object_type = 'client'
      AND opportunity.organization_id = source.organization_id
      AND opportunity.object_type = 'opportunity'
      AND opportunity.content_json ->> 'clientId' = source.content_json ->> 'id'
      AND opportunity.content_json ->> 'stage' NOT IN ('won', 'lost')
      AND opportunity.is_current = true
      AND opportunity.deleted_at IS NULL
      AND opportunity.source_deleted_at IS NULL
    ORDER BY (opportunity.content_json ->> 'expectedCloseDate')::date NULLS LAST
    LIMIT 1
  ) client_pipeline ON source.object_type = 'client'
  ORDER BY
    COALESCE(source.source_updated_at, source.source_created_at, source.created_at) DESC,
    source.source_id DESC
  LIMIT $3
`;

// Email, pipeline and planning reads stay on a deliberately small query plan.
// The client-only lateral aggregates above are useful for account cards, but
// even a false lateral join still adds compilation/JIT work in PostgreSQL.
const LIGHT_RECORDS_SQL = `
  WITH target AS (
    SELECT source.*
    FROM ops_memory.source_objects source
    WHERE source.organization_id = $1
      AND source.object_type = ANY($2::text[])
      AND source.is_current = true
      AND source.deleted_at IS NULL
      AND source.source_deleted_at IS NULL
      AND (
        $5::text IS NULL
        OR upper(COALESCE(
          source.content_json ->> 'id',
          source.metadata ->> 'externalId',
          source.source_id
        )) = upper($5)
      )
      AND COALESCE(source.content_json ->> 'archived', 'false') <> 'true'
      AND COALESCE(source.content_json ->> 'status', '') <> 'archived'
      AND (
        $4 <> 'opportunity'
        OR COALESCE(source.content_json ->> 'stage', '') NOT IN ('won', 'lost')
      )
      AND (
        $4 <> 'task'
        OR COALESCE(source.content_json ->> 'status', '') NOT IN ('done', 'cancelled')
      )
    ORDER BY
      COALESCE(source.source_updated_at, source.source_created_at, source.created_at) DESC,
      source.source_id DESC
    LIMIT $3
  )
  SELECT
    source.source_id,
    source.object_type,
    source.title,
    source.content_text,
    source.content_json,
    source.metadata,
    source.source_type,
    source.source_created_at,
    source.source_updated_at,
    source.created_at,
    client.display_name AS client_name,
    owner.display_name AS owner_name,
    project.display_name AS project_name,
    sender_contact.display_name AS sender_name,
    NULL::text AS primary_contact_email,
    NULL::numeric AS revenue_cents,
    NULL::numeric AS margin_percent,
    NULL::timestamptz AS last_interaction_at,
    NULL::text AS next_opportunity
  FROM target source
  LEFT JOIN ops_memory.entities client
    ON client.organization_id = source.organization_id
    AND client.entity_type = 'client'
    AND client.canonical_key = source.content_json ->> 'clientId'
    AND client.deleted_at IS NULL
  LEFT JOIN ops_memory.entities owner
    ON owner.organization_id = source.organization_id
    AND owner.entity_type = 'team-member'
    AND owner.canonical_key = COALESCE(
      source.content_json ->> 'ownerId',
      source.content_json ->> 'accountOwnerId'
    )
    AND owner.deleted_at IS NULL
  LEFT JOIN ops_memory.entities project
    ON project.organization_id = source.organization_id
    AND project.entity_type = 'project'
    AND project.canonical_key = source.content_json ->> 'projectId'
    AND project.deleted_at IS NULL
  LEFT JOIN ops_memory.entities sender_contact
    ON sender_contact.organization_id = source.organization_id
    AND sender_contact.entity_type = 'contact'
    AND sender_contact.attributes ->> 'email' = source.content_json ->> 'sender'
    AND sender_contact.deleted_at IS NULL
  ORDER BY
    COALESCE(source.source_updated_at, source.source_created_at, source.created_at) DESC,
    source.source_id DESC
`;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function timestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) {
    return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

function externalId(row: SourceObjectRow, data: Record<string, unknown>) {
  const metadata = asObject(row.metadata);
  return stringValue(data.id, stringValue(metadata.externalId, row.source_id));
}

function relations(data: Record<string, unknown>) {
  const linked = stringArray(data.linked);
  const keys = [
    "clientId",
    "primaryContactId",
    "projectId",
    "opportunityId",
    "threadId",
    "inReplyToId",
    "sourceDecisionId",
  ];
  const direct = keys.map((key) => stringValue(data[key])).filter(Boolean);
  const arrays = [
    ...stringArray(data.contactIds),
    ...stringArray(data.attachmentDocumentIds),
  ];
  return [...new Set([...linked, ...direct, ...arrays])];
}

function emailClassification(intent: string) {
  if (intent === "question") return "question";
  if (intent === "approval") return "positive";
  if (intent === "problem") return "priority";
  // A follow-up is an active request, not a permission to postpone it.
  if (intent === "follow-up") return "question";
  return "neutral";
}

function opportunityStage(stage: string) {
  return (({
    qualification: "Qualification",
    discovery: "Découverte",
    proposal: "Proposition",
    negotiation: "Négociation",
  } as Record<string, string>)[stage] ?? stage) || "Qualification";
}

function taskStatus(status: string) {
  if (status === "todo" || status === "active") return "open";
  if (status === "in-progress") return "in_progress";
  if (status === "blocked") return "in_progress";
  return status || "open";
}

function clientStatus(status: string, health: number) {
  if (status === "former-client") return "Dormant";
  if (status === "prospect") return "Prospect";
  if (health < 65) return "À risque";
  if (health < 72) return "À suivre";
  return "Actif";
}

function relativePlanningSlot(dueOn: string) {
  const due = new Date(`${dueOn.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return { dayIndex: -1, weekOffset: 0 };
  const businessDate = new Date(`${process.env.OPS_BUSINESS_DATE || "2026-07-17"}T12:00:00.000Z`);
  const businessWeekStart = new Date(businessDate);
  const mondayOffset = (businessWeekStart.getUTCDay() + 6) % 7;
  businessWeekStart.setUTCDate(businessWeekStart.getUTCDate() - mondayOffset);
  const dueWeekStart = new Date(due);
  dueWeekStart.setUTCDate(dueWeekStart.getUTCDate() - ((dueWeekStart.getUTCDay() + 6) % 7));
  return {
    dayIndex: Math.min(4, Math.max(0, (due.getUTCDay() + 6) % 7)),
    weekOffset: Math.round((dueWeekStart.getTime() - businessWeekStart.getTime()) / 604_800_000),
  };
}

function mapEmail(row: SourceObjectRow): CentralUiRecord {
  const data = asObject(row.content_json);
  const id = externalId(row, data);
  const direction = stringValue(data.direction, "outbound");
  const inbound = direction === "inbound";
  const subject = stringValue(data.subject, stringValue(row.title, "Email"));
  const body = stringValue(data.text, stringValue(data.body, row.content_text ?? ""));
  const recipients = stringArray(data.recipients);
  const senderEmail = stringValue(data.sender, stringValue(data.from));
  const sender = row.sender_name ? `${row.sender_name} <${senderEmail}>` : senderEmail;
  const recipient = recipients[0] || stringValue(data.to);
  const requiresAction = booleanValue(data.requiresAction, inbound);
  const intent = stringValue(data.extractedIntent, stringValue(data.classification, "neutral"));
  const classification = stringValue(data.classification, emailClassification(intent));
  const sentAt = stringValue(data.sentAt, stringValue(data.sent_at, timestamp(row.source_updated_at)));
  const company = stringValue(data.company, row.client_name ?? "");
  const summary = body.length > 220 ? `${body.slice(0, 217).trimEnd()}…` : body;
  return {
    id,
    title: subject,
    summary,
    type: "document",
    path: `central://emails/${id}`,
    createdAt: sentAt,
    attributes: {
      record_kind: "email",
      direction,
      mailbox: stringValue(data.mailbox, inbound ? "inbox" : "sent"),
      classification,
      status: stringValue(data.status, inbound && requiresAction ? "to_process" : inbound ? "read" : "sent"),
      sender,
      sender_email: senderEmail,
      recipient,
      company,
      thread_id: stringValue(data.threadId, stringValue(data.thread_id)),
      sent_at: sentAt,
      received_at: inbound ? sentAt : "",
      validated: !inbound,
      delivery_mode: row.source_type === "ops_action" ? "controlled_internal_outbox" : "source_connector",
      network_delivery: row.source_type !== "ops_action",
      archived: false,
    },
    relations: relations(data),
    content: body,
  };
}

function mapOpportunity(row: SourceObjectRow): CentralUiRecord {
  const data = asObject(row.content_json);
  const id = externalId(row, data);
  const title = stringValue(data.name, stringValue(row.title, "Opportunité"));
  const amount = numberValue(data.amount, numberValue(data.amountCents) / 100);
  const stage = opportunityStage(stringValue(data.stage));
  const owner = stringValue(data.owner, row.owner_name ?? "Marie");
  const source = stringValue(data.source, stringValue(data.acquisitionChannel, "OPS"));
  const next = stringValue(data.next, stringValue(data.nextStep, "À définir"));
  const company = stringValue(data.company, row.client_name ?? "");
  const summary = `Opportunité de ${amount.toLocaleString("fr-FR")} € au stade ${stage}, suivie par ${owner}.`;
  return {
    id,
    title,
    summary,
    type: "project",
    path: `central://opportunities/${id}`,
    createdAt: timestamp(row.source_updated_at ?? row.source_created_at ?? row.created_at),
    attributes: {
      record_kind: "opportunity",
      amount,
      stage,
      probability: numberValue(data.probability),
      owner,
      source_channel: source,
      next_action: next,
      company,
      status: "open",
      archived: false,
    },
    relations: relations(data),
    content: `${summary}\n\nProchaine action : ${next}`,
  };
}

function mapTask(row: SourceObjectRow): CentralUiRecord {
  const data = asObject(row.content_json);
  const id = externalId(row, data);
  const title = stringValue(data.title, stringValue(row.title, "Tâche"));
  const description = stringValue(data.description, row.content_text ?? title);
  const due = stringValue(data.due, stringValue(data.dueOn, "À planifier"));
  const inferredSlot = relativePlanningSlot(due);
  const owner = stringValue(data.owner, row.owner_name ?? "Marie");
  const project = stringValue(data.project, row.project_name ?? stringValue(data.projectId));
  return {
    id,
    title,
    summary: description,
    type: "project",
    path: `central://tasks/${id}`,
    createdAt: timestamp(row.source_updated_at ?? row.source_created_at ?? row.created_at),
    attributes: {
      record_kind: "task",
      owner,
      due,
      status: taskStatus(stringValue(data.status)),
      project,
      day_index: Number.isInteger(numberValue(data.dayIndex, Number.NaN))
        ? numberValue(data.dayIndex)
        : inferredSlot.dayIndex,
      week_offset: Number.isInteger(numberValue(data.weekOffset, Number.NaN))
        ? numberValue(data.weekOffset)
        : inferredSlot.weekOffset,
      priority: stringValue(data.priority, "normal"),
      archived: false,
    },
    relations: relations(data),
    content: description,
  };
}

function formatLastInteraction(value: string | Date | null) {
  if (!value) return "Aucun échange";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Aucun échange";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function mapClient(row: SourceObjectRow): CentralUiRecord {
  const data = asObject(row.content_json);
  const id = externalId(row, data);
  const title = stringValue(data.name, stringValue(row.title, "Client"));
  const health = numberValue(data.health, numberValue(data.healthScore, 70));
  const status = stringValue(data.status, "client");
  const uiStatus = ["Actif", "À risque", "À suivre", "Dormant", "Prospect"].includes(status)
    ? status
    : clientStatus(status, health);
  const owner = stringValue(data.owner, row.owner_name ?? "Marie");
  const revenue = numberValue(data.revenue, numberValue(row.revenue_cents) / 100);
  const margin = numberValue(data.margin, numberValue(row.margin_percent, 31));
  const last = stringValue(data.last, formatLastInteraction(row.last_interaction_at));
  const nextOpportunity = stringValue(data.opportunity, row.next_opportunity ?? "À qualifier");
  const email = stringValue(data.email, row.primary_contact_email ?? "");
  const summary = `${title} est un compte ${uiStatus.toLocaleLowerCase("fr")} suivi par ${owner}.`;
  return {
    id,
    title,
    summary,
    type: "client",
    path: `central://clients/${id}`,
    createdAt: timestamp(row.source_updated_at ?? row.source_created_at ?? row.created_at),
    attributes: {
      record_kind: "client",
      status: uiStatus,
      owner,
      revenue_12m: revenue,
      margin_percent: margin,
      health_score: health,
      last_interaction: last,
      next_opportunity: nextOpportunity,
      email,
      segment: stringValue(data.segment),
      city: stringValue(data.city),
      archived: false,
    },
    relations: relations(data),
    content: summary,
  };
}

export function mapCentralSourceObject(
  row: SourceObjectRow,
  kind: CentralUiRecordKind,
): CentralUiRecord | null {
  const data = asObject(row.content_json);
  if (booleanValue(data.archived) || stringValue(data.status).toLocaleLowerCase("fr") === "archived") {
    return null;
  }
  if (kind === "email") return mapEmail(row);
  if (kind === "opportunity") return mapOpportunity(row);
  if (kind === "task") return mapTask(row);
  return mapClient(row);
}

export async function readCentralUiRecords(options: {
  kind?: CentralUiRecordKind;
  id?: string;
  organizationSlug?: string;
  queryable?: SqlQueryable;
} = {}): Promise<CentralUiRecord[]> {
  const queryable = options.queryable ?? getCentralMemoryPool();
  const organizationSlug = options.organizationSlug?.trim()
    || process.env.OPS_ORGANIZATION_SLUG?.trim()
    || "atelier-beaumarchais";
  const organization = await queryable.query<OrganizationRow>(`
    SELECT id
    FROM ops_memory.organizations
    WHERE slug = $1 AND deleted_at IS NULL
    LIMIT 1
  `, [organizationSlug]);
  const organizationId = organization.rows[0]?.id;
  if (!organizationId) return [];

  const requestedKinds = options.kind ? [options.kind] : [...centralUiRecordKinds];
  const grouped = await Promise.all(requestedKinds.map(async (kind) => {
    const result = await queryable.query<SourceObjectRow>(
      kind === "client" ? RECORDS_SQL : LIGHT_RECORDS_SQL,
      [
      organizationId,
      objectTypes[kind],
      options.id ? 8 : limits[kind],
      kind,
      options.id?.trim() || null,
      ],
    );
    return result.rows
      .map((row) => mapCentralSourceObject(row, kind))
      .filter((record): record is CentralUiRecord => Boolean(record));
  }));

  const ordered = grouped.flat().sort((left, right) => (
    right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)
  ));
  const seen = new Set<string>();
  return ordered.filter((record) => {
    const id = record.id.toLocaleUpperCase("en");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Resolves one exact UI record inside the requested tenant. This deliberately
 * reuses the same mapping as list reads so an edit starts from the exact state
 * the user sees, while the SQL id predicate avoids scanning a bounded UI list.
 */
export async function readCentralUiRecordById(options: {
  id: string;
  kind: CentralUiRecordKind;
  organizationSlug?: string;
  queryable?: SqlQueryable;
}): Promise<CentralUiRecord | null> {
  const id = options.id.trim();
  if (!id) return null;
  const records = await readCentralUiRecords({
    ...options,
    id,
  });
  return records.find((record) => (
    record.id.toLocaleUpperCase("en") === id.toLocaleUpperCase("en")
  )) ?? null;
}

function semanticKey(record: Pick<CentralUiRecord, "title" | "attributes">) {
  const kind = typeof record.attributes.record_kind === "string"
    ? record.attributes.record_kind
    : "";
  const normalizedTitle = record.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("fr");
  return `${kind}:${normalizedTitle}`;
}

/**
 * Central memory is authoritative. Obsidian remains a useful human projection,
 * so records only present in the vault are retained as a graceful compatibility
 * layer while exact or semantic duplicates are replaced by PostgreSQL.
 */
type MergeableUiRecord = {
  id: string;
  title: string;
  createdAt: string;
  attributes: CentralUiRecord["attributes"];
};

export function mergeCentralAndProjectedRecords<T extends MergeableUiRecord>(
  central: readonly CentralUiRecord[],
  projected: readonly T[],
): Array<CentralUiRecord | T> {
  const centralIds = new Set(central.map((record) => record.id.toLocaleUpperCase("en")));
  const centralSemanticKeys = new Set(central.map(semanticKey));
  return [
    ...central,
    ...projected.filter((record) => (
      !centralIds.has(record.id.toLocaleUpperCase("en"))
      && !centralSemanticKeys.has(semanticKey(record))
    )),
  ].sort((left, right) => (
    right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)
  ));
}
