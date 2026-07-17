import { createHash } from "node:crypto";
import {
  getCentralMemoryPool,
  type CentralMemoryPool,
  type TransactionClient,
} from "@/lib/central-memory/database";
import type { ObsidianWriteResult } from "@/lib/obsidian-write";

export type CanonicalOpsActionType =
  | "create_opportunity"
  | "create_task"
  | "create_client"
  | "prepare_email"
  | "send_email";

export type ExecutableOpsAction = Record<string, unknown> & {
  type: CanonicalOpsActionType | "send_demo_email";
  execution: "propose" | "execute";
  reason: string;
};

export type InternalEmailReceipt = {
  provider: "ops_internal_outbox";
  receiptId: string;
  acceptedAt: string;
  recipient: string;
  deliveryState: "accepted";
  networkDelivery: false;
};

export type ControlledActionResult = {
  actionRunId: string | null;
  idempotencyKey: string;
  actionType: CanonicalOpsActionType;
  status: "proposed" | "succeeded";
  recordId: string;
  title: string;
  centralMemory: boolean;
  replayed: boolean;
  projection: ObsidianWriteResult;
  receipt?: InternalEmailReceipt;
};

export type ControlledActionProjectionContext = {
  actionRunId: string | null;
  actionType: CanonicalOpsActionType;
  recordId: string;
  idempotencyKey: string;
  receipt?: InternalEmailReceipt;
};

export type ControlledActionExecutorOptions = {
  pool?: CentralMemoryPool;
  organizationSlug?: string;
  idempotencyKey?: string;
  requestedBy?: string;
  approvedBy?: string;
  now?: () => Date;
  projectToObsidian: (
    action: ExecutableOpsAction,
    context: ControlledActionProjectionContext,
  ) => Promise<ObsidianWriteResult>;
};

export type ControlledRecordMutation = {
  id: string;
  kind: "email" | "opportunity" | "task" | "client";
  title: string;
  patch: Record<string, unknown>;
};

export type ControlledRecordMutationResult = {
  centralMemory: boolean;
  actionRunId: string | null;
  idempotencyKey: string;
  replayed: boolean;
};

type ActionRunRow = {
  id: string;
  status: string;
  output: unknown;
  external_receipt: unknown;
};

type OrganizationRow = { id: string };

type TransactionalWriteResult = {
  actionRunId: string;
  recordId: string;
  title: string;
  receipt?: InternalEmailReceipt;
  replayed: boolean;
};

export class ControlledActionError extends Error {
  constructor(
    public readonly code:
      | "validation_required"
      | "unsafe_email_recipient"
      | "organization_not_found"
      | "action_failed"
      | "projection_failed",
    message: string,
  ) {
    super(message);
    this.name = "ControlledActionError";
  }
}

export function canonicalOpsActionType(
  type: ExecutableOpsAction["type"],
): CanonicalOpsActionType {
  return type === "send_demo_email" ? "send_email" : type;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalJson(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalJson(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createActionIdempotencyKey(action: ExecutableOpsAction) {
  const canonical = {
    ...action,
    type: canonicalOpsActionType(action.type),
  };
  return `ops-action:${sha256(stableJson(canonical))}`;
}

export function isSafeInternalEmailRecipient(value: string) {
  const match = value.trim().toLocaleLowerCase("en").match(/^[^@\s]+@([^@\s]+)$/);
  return Boolean(match?.[1] === "example" || match?.[1].endsWith(".example"));
}

function requiredString(action: ExecutableOpsAction, key: string) {
  const value = action[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ControlledActionError("action_failed", `${key} is required.`);
  }
  return value.trim();
}

function actionTitle(action: ExecutableOpsAction, actionType: CanonicalOpsActionType) {
  if (actionType === "create_opportunity" || actionType === "create_client") {
    return requiredString(action, "name");
  }
  if (actionType === "create_task") return requiredString(action, "title");
  return requiredString(action, "subject");
}

function actionPrefix(type: CanonicalOpsActionType) {
  if (type === "create_opportunity") return "OPP";
  if (type === "create_task") return "TASK";
  if (type === "create_client") return "CLI";
  return type === "send_email" ? "EMAIL-SENT" : "EMAIL-DRAFT";
}

function actionRecordId(type: CanonicalOpsActionType, idempotencyKey: string) {
  return `${actionPrefix(type)}-${sha256(idempotencyKey).slice(0, 14).toLocaleUpperCase("en")}`;
}

function sourceObjectType(type: CanonicalOpsActionType) {
  if (type === "create_opportunity") return "opportunity";
  if (type === "create_task") return "task";
  if (type === "create_client") return "client";
  return type === "send_email" ? "email" : "email_draft";
}

function asReceipt(value: unknown): InternalEmailReceipt | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<InternalEmailReceipt>;
  if (
    candidate.provider !== "ops_internal_outbox"
    || typeof candidate.receiptId !== "string"
    || typeof candidate.acceptedAt !== "string"
    || typeof candidate.recipient !== "string"
    || candidate.deliveryState !== "accepted"
    || candidate.networkDelivery !== false
  ) return undefined;
  return candidate as InternalEmailReceipt;
}

function outputRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const output = value as { recordId?: unknown; title?: unknown };
  if (typeof output.recordId !== "string" || typeof output.title !== "string") return null;
  return { recordId: output.recordId, title: output.title };
}

async function upsertSourceObject(
  client: TransactionClient,
  input: {
    organizationId: string;
    eventId: string;
    recordId: string;
    objectType: string;
    title: string;
    action: ExecutableOpsAction;
    actionType: CanonicalOpsActionType;
    occurredAt: string;
    receipt?: InternalEmailReceipt;
  },
) {
  const content = {
    ...input.action,
    type: input.actionType,
    id: input.recordId,
    status: input.actionType === "send_email"
      ? "sent"
      : input.actionType === "prepare_email"
        ? "draft"
        : "active",
    ...(input.receipt ? { deliveryReceipt: input.receipt } : {}),
  };
  const result = await client.query<{ id: string }>(`
    INSERT INTO ops_memory.source_objects (
      organization_id, source_type, source_account_id, source_id, object_type,
      title, content_text, content_json, metadata, source_created_at,
      source_updated_at, last_event_id, content_hash, is_current
    ) VALUES (
      $1, 'ops_action', 'agent', $2, $3, $4, $5, $6::jsonb,
      $7::jsonb, $8, $8, $9, $10, true
    )
    ON CONFLICT (organization_id, source_type, source_account_id, source_id)
    DO UPDATE SET
      object_type = EXCLUDED.object_type,
      title = EXCLUDED.title,
      content_text = EXCLUDED.content_text,
      content_json = EXCLUDED.content_json,
      metadata = ops_memory.source_objects.metadata || EXCLUDED.metadata,
      source_updated_at = EXCLUDED.source_updated_at,
      last_event_id = EXCLUDED.last_event_id,
      content_hash = EXCLUDED.content_hash,
      is_current = true,
      deleted_at = NULL
    RETURNING id
  `, [
    input.organizationId,
    input.recordId,
    input.objectType,
    input.title,
    `${input.title}\n${typeof input.action.body === "string" ? input.action.body : input.action.reason}`,
    stableJson(content),
    stableJson({
      provenance: "ops_agent_action",
      controlled: true,
      network_delivery: false,
    }),
    input.occurredAt,
    input.eventId,
    sha256(stableJson(content)),
  ]);
  return result.rows[0].id;
}

async function writeBusinessRecord(
  client: TransactionClient,
  input: {
    organizationId: string;
    eventId: string;
    sourceObjectId: string;
    recordId: string;
    title: string;
    action: ExecutableOpsAction;
    actionType: CanonicalOpsActionType;
    occurredAt: string;
  },
) {
  if (input.actionType === "create_task") {
    const due = requiredString(input.action, "due");
    const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T17:00:00.000Z` : null;
    const requestedStatus = input.action.status;
    const status = requestedStatus === "done"
      ? "done"
      : requestedStatus === "in_progress"
        ? "in_progress"
        : "todo";
    await client.query(`
      INSERT INTO ops_memory.tasks (
        organization_id, external_key, title, description, status, priority,
        due_at, source_event_id, source_object_id
      ) VALUES ($1, $2, $3, $4, $5, 3, $6, $7, $8)
      ON CONFLICT (organization_id, external_key) WHERE external_key IS NOT NULL AND deleted_at IS NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        due_at = COALESCE(EXCLUDED.due_at, ops_memory.tasks.due_at),
        source_event_id = EXCLUDED.source_event_id,
        source_object_id = EXCLUDED.source_object_id,
        deleted_at = NULL
    `, [
      input.organizationId,
      input.recordId,
      input.title,
      requiredString(input.action, "description"),
      status,
      dueAt,
      input.eventId,
      input.sourceObjectId,
    ]);
    return;
  }

  if (input.actionType === "create_opportunity" || input.actionType === "create_client") {
    const attributes = {
      ...input.action,
      type: input.actionType,
      record_kind: input.actionType === "create_client" ? "client" : "opportunity",
      central_record_id: input.recordId,
    };
    await client.query(`
      INSERT INTO ops_memory.entities (
        organization_id, entity_type, canonical_key, display_name, summary,
        attributes, confidence, status, source_event_id, source_object_id,
        first_seen_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1, 'active', $7, $8, $9, $9)
      ON CONFLICT (organization_id, entity_type, canonical_key) WHERE deleted_at IS NULL
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        summary = EXCLUDED.summary,
        attributes = ops_memory.entities.attributes || EXCLUDED.attributes,
        source_event_id = EXCLUDED.source_event_id,
        source_object_id = EXCLUDED.source_object_id,
        last_seen_at = EXCLUDED.last_seen_at,
        deleted_at = NULL
    `, [
      input.organizationId,
      input.actionType === "create_client" ? "client" : "opportunity",
      input.recordId.toLocaleLowerCase("en"),
      input.title,
      input.actionType === "create_client"
        ? `${input.title}, compte suivi dans OPS.`
        : `${input.title}, opportunité suivie dans le pipeline OPS.`,
      stableJson(attributes),
      input.eventId,
      input.sourceObjectId,
      input.occurredAt,
    ]);
  }
}

async function insertAudit(
  client: TransactionClient,
  input: {
    organizationId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
    actorId: string;
    sourceEventId?: string;
    afterState?: unknown;
    metadata?: unknown;
  },
) {
  await client.query(`
    INSERT INTO ops_memory.audit_logs (
      organization_id, actor_type, actor_id, action, resource_type, resource_id,
      correlation_id, source_event_id, after_state, metadata
    ) VALUES ($1, 'user_via_agent', $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
  `, [
    input.organizationId,
    input.actorId,
    input.action,
    input.resourceType,
    input.resourceId,
    input.correlationId,
    input.sourceEventId ?? null,
    stableJson(input.afterState ?? {}),
    stableJson(input.metadata ?? {}),
  ]);
}

async function writeCentralAction(
  pool: CentralMemoryPool,
  action: ExecutableOpsAction,
  options: Required<Pick<ControlledActionExecutorOptions,
    "organizationSlug" | "requestedBy" | "approvedBy" | "now"
  >> & { idempotencyKey: string },
): Promise<TransactionalWriteResult> {
  const actionType = canonicalOpsActionType(action.type);
  const title = actionTitle(action, actionType);
  const recordId = actionRecordId(actionType, options.idempotencyKey);
  const occurredAt = options.now().toISOString();

  if (action.execution !== "execute") {
    throw new ControlledActionError("validation_required", "The action is only a proposal.");
  }
  if (!options.approvedBy.trim()) {
    throw new ControlledActionError("validation_required", "An approved action requires an approver.");
  }
  if (actionType === "send_email") {
    const recipient = requiredString(action, "to");
    if (!isSafeInternalEmailRecipient(recipient)) {
      throw new ControlledActionError(
        "unsafe_email_recipient",
        "Controlled email delivery only accepts the reserved .example namespace.",
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const organization = await client.query<OrganizationRow>(`
      SELECT id FROM ops_memory.organizations
      WHERE slug = $1 AND deleted_at IS NULL
      LIMIT 1
    `, [options.organizationSlug]);
    const organizationId = organization.rows[0]?.id;
    if (!organizationId) {
      throw new ControlledActionError(
        "organization_not_found",
        `Organization ${options.organizationSlug} was not found.`,
      );
    }

    const approvalStatus = actionType === "send_email" ? "approved" : "not_required";
    const inserted = await client.query<ActionRunRow>(`
      INSERT INTO ops_memory.action_runs (
        organization_id, idempotency_key, action_type, status, requested_by,
        agent_name, input, approval_status, approved_by, approved_at, started_at
      ) VALUES ($1, $2, $3, 'running', $4, 'OPS Agent — OpenCode', $5::jsonb,
        $6, $7, CASE WHEN $6 = 'approved' THEN $8::timestamptz ELSE NULL END, $8)
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING id, status, output, external_receipt
    `, [
      organizationId,
      options.idempotencyKey,
      actionType,
      options.requestedBy,
      stableJson({ ...action, type: actionType }),
      approvalStatus,
      approvalStatus === "approved" ? options.approvedBy : null,
      occurredAt,
    ]);

    if (!inserted.rows[0]) {
      const existing = await client.query<ActionRunRow>(`
        SELECT id, status, output, external_receipt
        FROM ops_memory.action_runs
        WHERE organization_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [organizationId, options.idempotencyKey]);
      const row = existing.rows[0];
      const output = row ? outputRecord(row.output) : null;
      if (!row || row.status !== "succeeded" || !output) {
        throw new ControlledActionError(
          "action_failed",
          "An action with this idempotency key exists but did not complete successfully.",
        );
      }
      await client.query("COMMIT");
      return {
        actionRunId: row.id,
        recordId: output.recordId,
        title: output.title,
        receipt: asReceipt(row.external_receipt),
        replayed: true,
      };
    }

    const actionRun = inserted.rows[0];
    const event = await client.query<{ id: string }>(`
      INSERT INTO ops_memory.source_events (
        organization_id, source_type, source_account_id, source_id, event_type,
        occurred_at, schema_version, idempotency_key, content_hash, payload,
        processing_state, processed_at
      ) VALUES ($1, 'ops_action', 'agent', $2, $3, $4, 1, $5, $6, $7::jsonb,
        'processed', $4)
      ON CONFLICT (organization_id, idempotency_key)
      DO UPDATE SET processing_state = 'processed', processed_at = EXCLUDED.processed_at
      RETURNING id
    `, [
      organizationId,
      recordId,
      `${actionType}.executed`,
      occurredAt,
      `event:${options.idempotencyKey}`,
      sha256(stableJson(action)),
      stableJson({ ...action, type: actionType, actionRunId: actionRun.id }),
    ]);
    const eventId = event.rows[0].id;

    const receipt = actionType === "send_email"
      ? {
          provider: "ops_internal_outbox" as const,
          receiptId: `outbox_${sha256(`${actionRun.id}:${recordId}`).slice(0, 24)}`,
          acceptedAt: occurredAt,
          recipient: requiredString(action, "to"),
          deliveryState: "accepted" as const,
          networkDelivery: false as const,
        }
      : undefined;
    const sourceObjectId = await upsertSourceObject(client, {
      organizationId,
      eventId,
      recordId,
      objectType: sourceObjectType(actionType),
      title,
      action,
      actionType,
      occurredAt,
      receipt,
    });
    await writeBusinessRecord(client, {
      organizationId,
      eventId,
      sourceObjectId,
      recordId,
      title,
      action,
      actionType,
      occurredAt,
    });

    if (actionType === "send_email" && !receipt) {
      throw new ControlledActionError(
        "action_failed",
        "An email cannot be marked sent without a controlled receipt.",
      );
    }
    const output = { recordId, title, sourceObjectId };
    await client.query(`
      UPDATE ops_memory.action_runs SET
        status = 'succeeded',
        output = $2::jsonb,
        external_receipt = $3::jsonb,
        completed_at = $4,
        error_code = NULL,
        error_message = NULL
      WHERE id = $1
    `, [actionRun.id, stableJson(output), stableJson(receipt ?? {}), occurredAt]);
    await client.query(`
      INSERT INTO ops_memory.knowledge_projections (
        organization_id, projection_type, projection_key, content_hash,
        rendered_content, source_revision, projection_status
      ) VALUES ($1, 'obsidian_markdown', $2, $3, $4, 1, 'pending')
      ON CONFLICT (organization_id, projection_type, projection_key)
      DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        rendered_content = EXCLUDED.rendered_content,
        source_revision = ops_memory.knowledge_projections.source_revision + 1,
        projection_status = 'pending',
        last_error = NULL,
        deleted_at = NULL
    `, [organizationId, recordId, sha256(stableJson(output)), stableJson({ action, receipt })]);
    await insertAudit(client, {
      organizationId,
      actorId: options.approvedBy,
      action: `${actionType}.succeeded`,
      resourceType: sourceObjectType(actionType),
      resourceId: recordId,
      correlationId: actionRun.id,
      sourceEventId: eventId,
      afterState: { ...output, receipt },
      metadata: {
        idempotency_key: options.idempotencyKey,
        approval_status: approvalStatus,
        controlled_internal_delivery: actionType === "send_email",
      },
    });
    await client.query("COMMIT");
    return {
      actionRunId: actionRun.id,
      recordId,
      title,
      receipt,
      replayed: false,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original action error is more useful than a rollback failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function markProjection(
  pool: CentralMemoryPool,
  input: {
    organizationSlug: string;
    actionRunId: string;
    recordId: string;
    projection: ObsidianWriteResult | null;
    error?: unknown;
  },
) {
  const status = input.projection ? "projected" : "failed";
  const error = input.error instanceof Error ? input.error.message.slice(0, 1_000) : null;
  await pool.query(`
    UPDATE ops_memory.knowledge_projections projection SET
      projection_status = $3,
      projected_at = CASE WHEN $3 = 'projected' THEN now() ELSE projection.projected_at END,
      last_error = $4
    FROM ops_memory.organizations organization
    WHERE projection.organization_id = organization.id
      AND organization.slug = $1
      AND projection.projection_type = 'obsidian_markdown'
      AND projection.projection_key = $2
  `, [input.organizationSlug, input.recordId, status, error]);
}

export async function executeControlledOpsAction(
  action: ExecutableOpsAction,
  options: ControlledActionExecutorOptions,
): Promise<ControlledActionResult> {
  const actionType = canonicalOpsActionType(action.type);
  const idempotencyKey = options.idempotencyKey?.trim() || createActionIdempotencyKey(action);
  const organizationSlug = options.organizationSlug?.trim() || "atelier-beaumarchais";
  const requestedBy = options.requestedBy?.trim() || "marie-delmas";
  const approvedBy = options.approvedBy?.trim() || "Marie Delmas";
  const now = options.now ?? (() => new Date());
  const title = actionTitle(action, actionType);
  const fallbackRecordId = actionRecordId(actionType, idempotencyKey);
  const databaseEnabled = Boolean(options.pool || process.env.DATABASE_URL?.trim());

  if (action.execution !== "execute") {
    throw new ControlledActionError("validation_required", "The action has not been approved for execution.");
  }
  if (actionType === "send_email" && !isSafeInternalEmailRecipient(requiredString(action, "to"))) {
    throw new ControlledActionError(
      "unsafe_email_recipient",
      "Controlled email delivery only accepts the reserved .example namespace.",
    );
  }

  if (!databaseEnabled) {
    const receipt = actionType === "send_email"
      ? {
          provider: "ops_internal_outbox" as const,
          receiptId: `outbox_${sha256(idempotencyKey).slice(0, 24)}`,
          acceptedAt: now().toISOString(),
          recipient: requiredString(action, "to"),
          deliveryState: "accepted" as const,
          networkDelivery: false as const,
        }
      : undefined;
    const projection = await options.projectToObsidian(action, {
      actionRunId: null,
      actionType,
      recordId: fallbackRecordId,
      idempotencyKey,
      receipt,
    });
    return {
      actionRunId: null,
      idempotencyKey,
      actionType,
      status: "succeeded",
      recordId: fallbackRecordId,
      title,
      centralMemory: false,
      replayed: false,
      projection,
      receipt,
    };
  }

  const pool = options.pool ?? getCentralMemoryPool();
  const written = await writeCentralAction(pool, action, {
    organizationSlug,
    idempotencyKey,
    requestedBy,
    approvedBy,
    now,
  });
  try {
    const projection = await options.projectToObsidian(action, {
      actionRunId: written.actionRunId,
      actionType,
      recordId: written.recordId,
      idempotencyKey,
      receipt: written.receipt,
    });
    await markProjection(pool, {
      organizationSlug,
      actionRunId: written.actionRunId,
      recordId: written.recordId,
      projection,
    });
    return {
      actionRunId: written.actionRunId,
      idempotencyKey,
      actionType,
      status: "succeeded",
      recordId: written.recordId,
      title: written.title,
      centralMemory: true,
      replayed: written.replayed,
      projection,
      receipt: written.receipt,
    };
  } catch (error) {
    try {
      await markProjection(pool, {
        organizationSlug,
        actionRunId: written.actionRunId,
        recordId: written.recordId,
        projection: null,
        error,
      });
    } catch {
      // Preserve the original projection failure for the retrying caller.
    }
    throw new ControlledActionError(
      "projection_failed",
      "The central action succeeded but its Obsidian projection failed and can be retried safely.",
    );
  }
}

/**
 * Mirrors an explicit edit made in the web application into the authoritative
 * central memory. The file projection is still performed by the records route,
 * while this function guarantees an idempotent action_run, event and audit row
 * for every accepted PATCH.
 */
export async function mirrorControlledRecordMutation(
  mutation: ControlledRecordMutation,
  options: {
    pool?: CentralMemoryPool;
    organizationSlug?: string;
    idempotencyKey?: string;
    requestedBy?: string;
    now?: () => Date;
  } = {},
): Promise<ControlledRecordMutationResult> {
  const id = mutation.id.trim().toLocaleUpperCase("en");
  if (!/^[A-Z0-9][A-Z0-9-]{5,79}$/.test(id)) {
    throw new ControlledActionError("action_failed", "Invalid record identifier.");
  }
  const idempotencyKey = options.idempotencyKey?.trim()
    || `ops-record-patch:${sha256(stableJson({ ...mutation, id }))}`;
  if (!options.pool && !process.env.DATABASE_URL?.trim()) {
    return {
      centralMemory: false,
      actionRunId: null,
      idempotencyKey,
      replayed: false,
    };
  }

  const pool = options.pool ?? getCentralMemoryPool();
  const organizationSlug = options.organizationSlug?.trim() || "atelier-beaumarchais";
  const requestedBy = options.requestedBy?.trim() || "marie-delmas";
  const occurredAt = (options.now ?? (() => new Date()))().toISOString();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const organization = await client.query<OrganizationRow>(`
      SELECT id FROM ops_memory.organizations
      WHERE slug = $1 AND deleted_at IS NULL
      LIMIT 1
    `, [organizationSlug]);
    const organizationId = organization.rows[0]?.id;
    if (!organizationId) {
      throw new ControlledActionError(
        "organization_not_found",
        `Organization ${organizationSlug} was not found.`,
      );
    }
    const inserted = await client.query<ActionRunRow>(`
      INSERT INTO ops_memory.action_runs (
        organization_id, idempotency_key, action_type, status, requested_by,
        agent_name, input, approval_status, started_at
      ) VALUES ($1, $2, $3, 'running', $4, 'OPS Web', $5::jsonb,
        'not_required', $6)
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING id, status, output, external_receipt
    `, [
      organizationId,
      idempotencyKey,
      `${mutation.kind}.update`,
      requestedBy,
      stableJson({ ...mutation, id }),
      occurredAt,
    ]);
    if (!inserted.rows[0]) {
      const existing = await client.query<ActionRunRow>(`
        SELECT id, status, output, external_receipt
        FROM ops_memory.action_runs
        WHERE organization_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [organizationId, idempotencyKey]);
      const row = existing.rows[0];
      if (!row || row.status !== "succeeded") {
        throw new ControlledActionError("action_failed", "The record update did not complete.");
      }
      await client.query("COMMIT");
      return {
        centralMemory: true,
        actionRunId: row.id,
        idempotencyKey,
        replayed: true,
      };
    }

    const actionRun = inserted.rows[0];
    const event = await client.query<{ id: string }>(`
      INSERT INTO ops_memory.source_events (
        organization_id, source_type, source_account_id, source_id, event_type,
        occurred_at, schema_version, idempotency_key, content_hash, payload,
        processing_state, processed_at
      ) VALUES ($1, 'ops_app', 'web', $2, $3, $4, 1, $5, $6, $7::jsonb,
        'processed', $4)
      ON CONFLICT (organization_id, idempotency_key)
      DO UPDATE SET processing_state = 'processed', processed_at = EXCLUDED.processed_at
      RETURNING id
    `, [
      organizationId,
      id,
      `${mutation.kind}.updated`,
      occurredAt,
      `event:${idempotencyKey}`,
      sha256(stableJson(mutation.patch)),
      stableJson({ ...mutation, id, actionRunId: actionRun.id }),
    ]);
    const eventId = event.rows[0].id;
    const contentText = [mutation.title, ...Object.values(mutation.patch)]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .slice(0, 50_000);
    const sourceObject = await client.query<{ id: string }>(`
      INSERT INTO ops_memory.source_objects (
        organization_id, source_type, source_account_id, source_id, object_type,
        title, content_text, content_json, metadata, source_created_at,
        source_updated_at, last_event_id, content_hash, is_current
      ) VALUES ($1, 'ops_action', 'agent', $2, $3, $4, $5, $6::jsonb,
        $7::jsonb, $8, $8, $9, $10, true)
      ON CONFLICT (organization_id, source_type, source_account_id, source_id)
      DO UPDATE SET
        object_type = EXCLUDED.object_type,
        title = EXCLUDED.title,
        content_text = CASE
          WHEN EXCLUDED.content_text = '' THEN ops_memory.source_objects.content_text
          ELSE EXCLUDED.content_text
        END,
        content_json = ops_memory.source_objects.content_json || EXCLUDED.content_json,
        metadata = ops_memory.source_objects.metadata || EXCLUDED.metadata,
        source_updated_at = EXCLUDED.source_updated_at,
        last_event_id = EXCLUDED.last_event_id,
        content_hash = EXCLUDED.content_hash,
        is_current = true,
        deleted_at = NULL
      RETURNING id
    `, [
      organizationId,
      id,
      mutation.kind,
      mutation.title,
      contentText,
      stableJson({ id, ...mutation.patch }),
      stableJson({ provenance: "ops_web_patch", controlled: true }),
      occurredAt,
      eventId,
      sha256(stableJson(mutation.patch)),
    ]);

    if (mutation.kind === "task") {
      const status = mutation.patch.archived === true
        ? "cancelled"
        : mutation.patch.status === "done"
          ? "done"
          : mutation.patch.status === "in_progress"
            ? "in_progress"
            : "todo";
      await client.query(`
        UPDATE ops_memory.tasks SET
          title = COALESCE($3, title),
          description = COALESCE($4, description),
          status = $5,
          source_event_id = $6,
          source_object_id = $7,
          deleted_at = NULL
        WHERE organization_id = $1 AND external_key = $2 AND deleted_at IS NULL
      `, [
        organizationId,
        id,
        typeof mutation.patch.title === "string" ? mutation.patch.title : null,
        typeof mutation.patch.description === "string" ? mutation.patch.description : null,
        status,
        eventId,
        sourceObject.rows[0].id,
      ]);
    } else if (mutation.kind === "client" || mutation.kind === "opportunity") {
      await client.query(`
        UPDATE ops_memory.entities SET
          display_name = COALESCE($3, display_name),
          attributes = attributes || $4::jsonb,
          status = CASE WHEN $5 THEN 'archived' ELSE status END,
          source_event_id = $6,
          source_object_id = $7,
          last_seen_at = $8
        WHERE organization_id = $1
          AND entity_type = $2
          AND (
            canonical_key = $9
            OR attributes ->> 'central_record_id' = $10
            OR attributes ->> 'id' = $10
          )
          AND deleted_at IS NULL
      `, [
        organizationId,
        mutation.kind,
        typeof mutation.patch.name === "string" ? mutation.patch.name : null,
        stableJson(mutation.patch),
        mutation.patch.archived === true,
        eventId,
        sourceObject.rows[0].id,
        occurredAt,
        id.toLocaleLowerCase("en"),
        id,
      ]);
    }

    await client.query(`
      INSERT INTO ops_memory.knowledge_projections (
        organization_id, projection_type, projection_key, content_hash,
        rendered_content, source_revision, projection_status
      ) VALUES ($1, 'obsidian_markdown', $2, $3, $4, 1, 'pending')
      ON CONFLICT (organization_id, projection_type, projection_key)
      DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        rendered_content = EXCLUDED.rendered_content,
        source_revision = ops_memory.knowledge_projections.source_revision + 1,
        projection_status = 'pending',
        last_error = NULL,
        deleted_at = NULL
    `, [
      organizationId,
      id,
      sha256(stableJson(mutation.patch)),
      stableJson({ kind: mutation.kind, title: mutation.title, patch: mutation.patch }),
    ]);

    await client.query(`
      UPDATE ops_memory.action_runs SET
        status = 'succeeded',
        output = $2::jsonb,
        completed_at = $3
      WHERE id = $1
    `, [actionRun.id, stableJson({ recordId: id, title: mutation.title }), occurredAt]);
    await insertAudit(client, {
      organizationId,
      actorId: requestedBy,
      action: `${mutation.kind}.updated`,
      resourceType: mutation.kind,
      resourceId: id,
      correlationId: actionRun.id,
      sourceEventId: eventId,
      afterState: mutation.patch,
      metadata: { idempotency_key: idempotencyKey, controlled: true },
    });
    await client.query("COMMIT");
    return {
      centralMemory: true,
      actionRunId: actionRun.id,
      idempotencyKey,
      replayed: false,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original persistence failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Records the outcome of the filesystem projection created after a controlled
 * central edit. A failed projection remains explicitly retryable while the
 * central transaction and its audit trail stay authoritative. */
export async function markControlledRecordMutationProjection(
  input: {
    recordId: string;
    projection: ObsidianWriteResult | null;
    error?: unknown;
  },
  options: {
    pool?: CentralMemoryPool;
    organizationSlug?: string;
  } = {},
) {
  if (!options.pool && !process.env.DATABASE_URL?.trim()) return;
  const pool = options.pool ?? getCentralMemoryPool();
  const organizationSlug = options.organizationSlug?.trim() || "atelier-beaumarchais";
  const status = input.projection ? "projected" : "failed";
  const error = input.error instanceof Error
    ? input.error.message.slice(0, 1_000)
    : input.error
      ? String(input.error).slice(0, 1_000)
      : null;
  await pool.query(`
    UPDATE ops_memory.knowledge_projections projection SET
      projection_status = $3,
      projected_at = CASE WHEN $3 = 'projected' THEN now() ELSE projection.projected_at END,
      last_error = $4
    FROM ops_memory.organizations organization
    WHERE projection.organization_id = organization.id
      AND organization.slug = $1
      AND projection.projection_type = 'obsidian_markdown'
      AND projection.projection_key = $2
      AND projection.deleted_at IS NULL
  `, [organizationSlug, input.recordId.toLocaleUpperCase("en"), status, error]);
}
