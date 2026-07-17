import { NextResponse } from "next/server";
import { z } from "zod";
import { guardPostRequest } from "@/lib/api-guard";
import {
  buildObsidianVaultIndex,
  findObsidianMemoryRecord,
  type ObsidianMemoryRecord,
} from "@/lib/obsidian-vault-memory";
import {
  resolveOpsDemoVaultRoot,
  updateObsidianRecord,
  writeObsidianRecord,
  type ObsidianWriteInput,
  type ObsidianWriteResult,
} from "@/lib/obsidian-write";
import {
  ControlledActionError,
  executeControlledOpsAction,
  markControlledRecordMutationProjection,
  mirrorControlledRecordMutation,
} from "@/lib/ops-action-executor";
import {
  projectOpsAgentActionToObsidian,
  type OpsAgentAction,
} from "@/lib/ops-agent-actions";
import {
  mergeCentralAndProjectedRecords,
  readCentralUiRecordById,
  readCentralUiRecords,
  type CentralUiRecord,
  type CentralUiRecordKind,
} from "@/lib/central-memory/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailSchema = z.object({
  kind: z.literal("email"),
  subject: z.string().trim().min(1).max(180),
  to: z.string().trim().min(1).max(240),
  from: z.string().trim().min(1).max(240).default("Marie Delmas <marie@atelier-beaumarchais.fr>"),
  company: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(20_000),
  threadId: z.string().trim().max(100).optional(),
  linked: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
  mailbox: z.enum(["inbox", "sent", "waiting", "archive"]).default("sent"),
  classification: z.enum(["positive", "question", "later", "opposition", "priority", "neutral"]).default("neutral"),
  status: z.enum(["draft", "to_process", "sent_demo"]).default("draft"),
  validated: z.boolean().default(false),
});

const opportunitySchema = z.object({
  kind: z.literal("opportunity"),
  name: z.string().trim().min(1).max(180),
  amount: z.number().finite().min(0).max(100_000_000),
  stage: z.enum(["Qualification", "Découverte", "Proposition", "Négociation"]),
  probability: z.number().finite().min(0).max(100),
  owner: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(120),
  next: z.string().trim().min(1).max(240),
  company: z.string().trim().max(180).optional(),
  linked: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
});

const taskSchema = z.object({
  kind: z.literal("task"),
  title: z.string().trim().min(1).max(180),
  owner: z.string().trim().min(1).max(120),
  due: z.string().trim().min(1).max(120),
  status: z.enum(["open", "in_progress", "done"]).default("open"),
  description: z.string().trim().min(1).max(8_000),
  project: z.string().trim().min(1).max(180).optional(),
  dayIndex: z.number().int().min(0).max(4).optional(),
  weekOffset: z.number().int().min(-52).max(52).default(0),
  linked: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
});

const clientSchema = z.object({
  kind: z.literal("client"),
  name: z.string().trim().min(1).max(180),
  status: z.enum(["Actif", "À risque", "À suivre", "Dormant", "Prospect"]),
  owner: z.string().trim().min(1).max(120),
  revenue: z.number().finite().min(0).max(100_000_000),
  margin: z.number().finite().min(-100).max(100),
  health: z.number().finite().min(0).max(100),
  last: z.string().trim().min(1).max(120),
  opportunity: z.string().trim().min(1).max(240),
  email: z.string().trim().email().max(240).optional(),
  linked: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
});

const recordSchema = z.discriminatedUnion("kind", [
  emailSchema,
  opportunitySchema,
  taskSchema,
  clientSchema,
]);
const recordIdSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{5,79}$/);
const patchRecordSchema = z.discriminatedUnion("kind", [
  emailSchema.omit({ kind: true }).partial().extend({
    kind: z.literal("email"),
    id: recordIdSchema,
    archived: z.boolean().optional(),
  }),
  opportunitySchema.omit({ kind: true }).partial().extend({
    kind: z.literal("opportunity"),
    id: recordIdSchema,
    archived: z.boolean().optional(),
  }),
  taskSchema.omit({ kind: true }).partial().extend({
    kind: z.literal("task"),
    id: recordIdSchema,
    archived: z.boolean().optional(),
  }),
  clientSchema.omit({ kind: true }).partial().extend({
    kind: z.literal("client"),
    id: recordIdSchema,
    archived: z.boolean().optional(),
  }),
]);
const readableKinds = new Set(["email", "opportunity", "task", "client"]);
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

function appRecordKind(record: ObsidianMemoryRecord) {
  const kind = record.attributes.record_kind;
  return typeof kind === "string" ? kind : "";
}

function recordPayload(record: ObsidianMemoryRecord) {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    type: record.type,
    path: record.path,
    createdAt: record.updatedAt,
    attributes: record.attributes,
    relations: record.relations,
    // Email notes contain front matter, title, summary, provenance and relations.
    // The mail reader must receive the preserved message only; returning the
    // complete Markdown note makes the UI display internal Obsidian metadata.
    content: inferRecordKind(record) === "email"
      ? currentEmailBody(record)
      : record.content,
  };
}

function createdRecordPayload(record: ObsidianWriteResult) {
  return {
    id: record.id,
    title: record.title,
    path: record.relativePath,
    createdAt: record.createdAt,
  };
}

function stringAttribute(record: ObsidianMemoryRecord, key: string, fallback = "") {
  const value = record.attributes[key];
  return typeof value === "string" ? value : fallback;
}

function numberAttribute(record: ObsidianMemoryRecord, key: string, fallback = 0) {
  const value = record.attributes[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanAttribute(record: ObsidianMemoryRecord, key: string, fallback = false) {
  const value = record.attributes[key];
  return typeof value === "boolean" ? value : fallback;
}

function isArchivedRecord(record: ObsidianMemoryRecord) {
  return (
    booleanAttribute(record, "archived")
    || stringAttribute(record, "status").toLocaleLowerCase("fr") === "archived"
  );
}

function inferRecordKind(record: ObsidianMemoryRecord) {
  const explicit = appRecordKind(record);
  if (readableKinds.has(explicit)) return explicit;
  if (/^EMAIL-/i.test(record.id)) return "email";
  if (/^OPP-/i.test(record.id)) return "opportunity";
  if (/^(?:TASK|TSK)-/i.test(record.id)) return "task";
  if (/^(?:CLI|CLIENT|CLT)-/i.test(record.id)) return "client";
  return "";
}

function centralRecordAsObsidian(record: CentralUiRecord): ObsidianMemoryRecord {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    summary: record.summary,
    facts: [],
    relations: record.relations,
    aliases: [],
    updatedAt: record.createdAt,
    source: "OPS central memory",
    path: record.path,
    attributes: record.attributes,
    content: record.content,
  };
}

async function persistRecordProjection(
  hasExistingProjection: boolean,
  input: ObsidianWriteInput & { id: string },
) {
  return hasExistingProjection
    ? updateObsidianRecord(input)
    : writeObsidianRecord(input);
}

function currentEmailBody(record: ObsidianMemoryRecord) {
  const message = record.content.match(/(?:^|\n)#{0,6}\s*Message\s*\n[\s\S]*?À\s*:\s*[^\n]+\n+([\s\S]*?)(?=\n#{0,6}\s*Relations\s*$|$)/i)?.[1];
  return message?.trim() || record.summary;
}

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") ?? "";
  if (kind && !readableKinds.has(kind)) {
    return NextResponse.json(
      { error: "invalid_record_kind" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  let centralRecords: CentralUiRecord[] | null = null;
  if (process.env.DATABASE_URL?.trim()) {
    try {
      centralRecords = await readCentralUiRecords({
        kind: kind ? kind as CentralUiRecordKind : undefined,
      });
    } catch (error) {
      // A connector or a migration may briefly be unavailable. Obsidian is a
      // read-compatible projection, so the executive UI can remain usable.
      console.error("[records] Unable to read the central memory.", error);
    }
  }

  let projectedRecords: CentralUiRecord[] | null = null;
  try {
    const root = await resolveOpsDemoVaultRoot();
    const index = await buildObsidianVaultIndex(root);
    projectedRecords = index.records
      .filter((record) => !kind || inferRecordKind(record) === kind)
      .filter((record) => !isArchivedRecord(record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((record) => recordPayload(record) as CentralUiRecord);
  } catch (error) {
    console.error("[records] Unable to read the Obsidian projection.", error);
  }

  if (centralRecords !== null) {
    const records = projectedRecords
      ? mergeCentralAndProjectedRecords(centralRecords, projectedRecords)
      : centralRecords;
    return NextResponse.json({ records }, { headers: noStoreHeaders });
  }
  if (projectedRecords !== null) {
    return NextResponse.json({ records: projectedRecords }, { headers: noStoreHeaders });
  }
  return NextResponse.json(
    { error: "records_read_failed" },
    { status: 503, headers: noStoreHeaders },
  );
}

export async function PATCH(request: Request) {
  const denied = guardPostRequest(request, "records-patch", 60);
  if (denied) return denied;
  if (!request.headers.get("content-type")?.toLocaleLowerCase("en").includes("application/json")) {
    return NextResponse.json(
      { error: "json_required" },
      { status: 415, headers: noStoreHeaders },
    );
  }

  let parsed: z.output<typeof patchRecordSchema>;
  try {
    parsed = patchRecordSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "invalid_record_patch" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    let projectedRecord: ObsidianMemoryRecord | null = null;
    try {
      const root = await resolveOpsDemoVaultRoot();
      const index = await buildObsidianVaultIndex(root);
      const candidate = findObsidianMemoryRecord(index, parsed.id);
      if (candidate?.id.toLocaleUpperCase("fr") === parsed.id.toLocaleUpperCase("fr")) {
        projectedRecord = candidate;
      }
    } catch (error) {
      console.error("[records] Unable to resolve the existing Obsidian projection.", error);
    }

    let centralRecord: CentralUiRecord | null = null;
    if (process.env.DATABASE_URL?.trim()) {
      try {
        centralRecord = await readCentralUiRecordById({
          id: parsed.id,
          kind: parsed.kind,
        });
      } catch (error) {
        console.error("[records] Unable to resolve the central record for mutation.", error);
      }
    }

    const record = centralRecord
      ? centralRecordAsObsidian(centralRecord)
      : projectedRecord;
    if (!record) {
      return NextResponse.json(
        { error: "record_not_found" },
        { status: 404, headers: noStoreHeaders },
      );
    }
    if (inferRecordKind(record) !== parsed.kind) {
      return NextResponse.json(
        { error: "record_kind_mismatch" },
        { status: 409, headers: noStoreHeaders },
      );
    }

    // Archiving is monotonic through this API. A later partial PATCH must not
    // accidentally resurrect a record because it omitted (or reset) the flag.
    const archived = isArchivedRecord(record) || parsed.archived === true;
    const hasExistingProjection = Boolean(projectedRecord);
    let projectionInput: ObsidianWriteInput & { id: string };
    let centralPatch = parsed as unknown as Record<string, unknown>;

    if (parsed.kind === "email") {
      const existingReceipt = stringAttribute(record, "delivery_receipt");
      const requestedLegacySend = parsed.status === "sent_demo";
      const status = requestedLegacySend
        ? "sent"
        : parsed.status ?? stringAttribute(record, "status", "draft");
      const validated = parsed.validated ?? booleanAttribute(record, "validated");
      if (status === "sent" && (!validated || !existingReceipt)) {
        return NextResponse.json(
          { error: existingReceipt ? "validation_required" : "controlled_receipt_required" },
          { status: 409, headers: noStoreHeaders },
        );
      }
      const to = parsed.to ?? stringAttribute(record, "recipient", "destinataire@exemple.fr");
      const from = parsed.from ?? stringAttribute(record, "sender", "Marie Delmas <marie@atelier-beaumarchais.fr>");
      const body = parsed.body ?? currentEmailBody(record);
      projectionInput = {
        id: record.id,
        idPrefix: "EMAIL",
        folder: "04_Conversations/Emails",
        type: "document",
        title: parsed.subject ?? record.title,
        summary: status === "sent"
          ? `Email remis à la boîte d'envoi contrôlée pour ${to}.`
          : `Email à traiter avec ${to}.`,
        body: `## Message\n\nDe : ${from}\n\nÀ : ${to}\n\n${body}`,
        relations: parsed.linked ?? record.relations,
        attributes: {
          record_kind: "email",
          direction: stringAttribute(record, "direction", "outbound"),
          mailbox: parsed.mailbox ?? stringAttribute(record, "mailbox", status === "sent" ? "sent" : "inbox"),
          classification: parsed.classification ?? stringAttribute(record, "classification", "neutral"),
          status,
          recipient: to,
          sender: from,
          company: parsed.company ?? stringAttribute(record, "company"),
          thread_id: parsed.threadId ?? stringAttribute(record, "thread_id"),
          sent_at: stringAttribute(record, "sent_at"),
          validated,
          delivery_mode: status === "sent" ? "controlled_internal_outbox" : "draft_only",
          delivery_receipt: existingReceipt,
          network_delivery: false,
          archived,
        },
      };
      centralPatch = {
        subject: parsed.subject ?? record.title,
        to,
        recipients: [to],
        from,
        sender: from,
        company: parsed.company ?? stringAttribute(record, "company"),
        body,
        text: body,
        threadId: parsed.threadId ?? stringAttribute(record, "thread_id"),
        linked: parsed.linked ?? record.relations,
        mailbox: parsed.mailbox ?? stringAttribute(record, "mailbox", status === "sent" ? "sent" : "inbox"),
        classification: parsed.classification ?? stringAttribute(record, "classification", "neutral"),
        direction: stringAttribute(record, "direction", "outbound"),
        status,
        validated,
        archived,
        network_delivery: false,
      };
    } else if (parsed.kind === "opportunity") {
      const amount = parsed.amount ?? numberAttribute(record, "amount");
      const stage = parsed.stage ?? stringAttribute(record, "stage", "Qualification");
      const probability = parsed.probability ?? numberAttribute(record, "probability");
      const owner = parsed.owner ?? stringAttribute(record, "owner", "Marie");
      const source = parsed.source ?? stringAttribute(record, "source_channel", "OPS");
      const next = parsed.next ?? stringAttribute(record, "next_action", "À définir");
      const title = parsed.name ?? record.title;
      projectionInput = {
        id: record.id,
        idPrefix: "OPP",
        folder: "03_CRM/Opportunites",
        type: "project",
        title,
        summary: `Opportunité de ${amount.toLocaleString("fr-FR")} € au stade ${stage}, origine ${source}.`,
        body: `## Données commerciales\n\n- Montant : ${amount.toLocaleString("fr-FR")} €.\n- Étape : ${stage}.\n- Probabilité : ${probability} %.\n- Responsable : ${owner}.\n- Source : ${source}.\n- Prochaine action : ${next}.`,
        relations: parsed.linked ?? record.relations,
        attributes: {
          record_kind: "opportunity",
          amount,
          stage,
          probability,
          owner,
          source_channel: source,
          next_action: next,
          company: parsed.company ?? stringAttribute(record, "company"),
          status: archived ? "archived" : stringAttribute(record, "status", "open"),
          archived,
        },
      };
      centralPatch = {
        name: title,
        amount,
        stage,
        probability,
        owner,
        source,
        next,
        company: parsed.company ?? stringAttribute(record, "company"),
        linked: parsed.linked ?? record.relations,
        status: archived ? "archived" : stringAttribute(record, "status", "open"),
        archived,
      };
    } else if (parsed.kind === "task") {
      const title = parsed.title ?? record.title;
      const owner = parsed.owner ?? stringAttribute(record, "owner", "Marie");
      const due = parsed.due ?? stringAttribute(record, "due", "À planifier");
      const status = parsed.status ?? stringAttribute(record, "status", "open");
      const description = parsed.description ?? record.summary;
      const project = parsed.project ?? stringAttribute(record, "project");
      const dayIndex = parsed.dayIndex ?? numberAttribute(record, "day_index");
      const weekOffset = parsed.weekOffset ?? numberAttribute(record, "week_offset");
      projectionInput = {
        id: record.id,
        idPrefix: "TASK",
        folder: "06_Operations/Taches",
        type: "project",
        title,
        summary: description,
        body: `## Exécution\n\n- Responsable : ${owner}.\n- Échéance : ${due}.\n- Statut : ${status}.\n${project ? `- Projet : ${project}.\n` : ""}- Semaine relative : ${weekOffset}.\n- Jour ouvré : ${dayIndex + 1}.`,
        relations: parsed.linked ?? record.relations,
        attributes: {
          record_kind: "task",
          owner,
          due,
          status,
          project,
          day_index: dayIndex,
          week_offset: weekOffset,
          archived,
        },
      };
      centralPatch = {
        title,
        owner,
        due,
        status,
        description,
        project,
        dayIndex,
        weekOffset,
        linked: parsed.linked ?? record.relations,
        archived,
      };
    } else {
      const title = parsed.name ?? record.title;
      const status = parsed.status ?? stringAttribute(record, "status", "Prospect");
      const owner = parsed.owner ?? stringAttribute(record, "owner", "Marie");
      const revenue = parsed.revenue ?? numberAttribute(record, "revenue_12m");
      const margin = parsed.margin ?? numberAttribute(record, "margin_percent");
      const health = parsed.health ?? numberAttribute(record, "health_score");
      const last = parsed.last ?? stringAttribute(record, "last_interaction", "Aujourd’hui");
      const opportunity = parsed.opportunity ?? stringAttribute(record, "next_opportunity", "À qualifier");
      const email = parsed.email ?? stringAttribute(record, "email");
      projectionInput = {
        id: record.id,
        idPrefix: "CLI",
        folder: "03_CRM/Clients",
        type: "client",
        title,
        summary: `${title} est un compte ${status.toLocaleLowerCase("fr")} suivi par ${owner}.`,
        body: `## Situation du compte\n\n- Statut : ${status}.\n- Responsable : ${owner}.\n- Chiffre d'affaires sur 12 mois : ${revenue.toLocaleString("fr-FR")} €.\n- Marge moyenne : ${margin.toLocaleString("fr-FR")} %.\n- Santé du compte : ${health} / 100.\n- Dernier échange : ${last}.\n- Prochaine opportunité ou action : ${opportunity}.\n${email ? `- Email principal : ${email}.` : ""}`,
        relations: parsed.linked ?? record.relations,
        attributes: {
          record_kind: "client",
          status,
          owner,
          revenue_12m: revenue,
          margin_percent: margin,
          health_score: health,
          last_interaction: last,
          next_opportunity: opportunity,
          email,
          archived,
        },
      };
      centralPatch = {
        name: title,
        status,
        owner,
        revenue,
        margin,
        health,
        last,
        opportunity,
        email,
        linked: parsed.linked ?? record.relations,
        archived,
      };
    }

    const centralMutation = await mirrorControlledRecordMutation({
      id: record.id,
      kind: parsed.kind,
      title: projectionInput.title,
      patch: centralPatch,
    }, {
      idempotencyKey: request.headers.get("idempotency-key")?.trim() || undefined,
      requestedBy: "marie-delmas",
    });
    let result: ObsidianWriteResult;
    try {
      result = await persistRecordProjection(hasExistingProjection, projectionInput);
    } catch (projectionError) {
      if (centralMutation.centralMemory) {
        try {
          await markControlledRecordMutationProjection({
            recordId: record.id,
            projection: null,
            error: projectionError,
          });
        } catch (markError) {
          console.error("[records] Unable to mark the failed Obsidian projection.", markError);
        }
        return NextResponse.json({
          record: {
            id: record.id,
            title: projectionInput.title,
            path: record.path,
            createdAt: new Date().toISOString(),
          },
          centralMemory: true,
          projection: "pending_retry",
        }, { status: 202, headers: noStoreHeaders });
      }
      throw projectionError;
    }
    if (centralMutation.centralMemory) {
      await markControlledRecordMutationProjection({ recordId: record.id, projection: result });
    }

    return NextResponse.json(
      {
        record: createdRecordPayload(result),
        centralMemory: centralMutation.centralMemory,
        projection: "projected",
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof ControlledActionError) {
      const status = error.code === "validation_required"
        || error.code === "unsafe_email_recipient"
        ? 409
        : 503;
      return NextResponse.json(
        { error: error.code },
        { status, headers: noStoreHeaders },
      );
    }
    console.error("[records] Unable to update the Obsidian record.", error);
    return NextResponse.json(
      { error: "record_update_failed" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}

export async function POST(request: Request) {
  const denied = guardPostRequest(request, "records", 30);
  if (denied) return denied;
  if (!request.headers.get("content-type")?.toLocaleLowerCase("en").includes("application/json")) {
    return NextResponse.json(
      { error: "json_required" },
      { status: 415, headers: noStoreHeaders },
    );
  }

  let parsed: z.output<typeof recordSchema>;
  try {
    parsed = recordSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "invalid_record" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    if (parsed.kind === "email" && parsed.status === "sent_demo" && !parsed.validated) {
      return NextResponse.json(
        { error: "validation_required" },
        { status: 409, headers: noStoreHeaders },
      );
    }

    let action: OpsAgentAction;
    if (parsed.kind === "email") {
      action = {
        type: parsed.status === "sent_demo" ? "send_demo_email" : "prepare_email",
        execution: "execute",
        reason: parsed.status === "sent_demo"
          ? "Envoi explicitement validé depuis la boîte email OPS."
          : "Création d'un brouillon depuis la boîte email OPS.",
        subject: parsed.subject,
        to: parsed.to,
        body: parsed.body,
        company: parsed.company ?? null,
        threadId: parsed.threadId ?? null,
        linked: parsed.linked,
      };
    } else if (parsed.kind === "opportunity") {
      action = {
        type: "create_opportunity",
        execution: "execute",
        reason: "Création explicitement demandée depuis le pipeline OPS.",
        name: parsed.name,
        amount: parsed.amount,
        stage: parsed.stage,
        probability: parsed.probability,
        owner: parsed.owner,
        source: parsed.source,
        next: parsed.next,
        company: parsed.company ?? null,
        linked: parsed.linked,
      };
    } else if (parsed.kind === "task") {
      action = {
        type: "create_task",
        execution: "execute",
        reason: "Création explicitement demandée depuis le planning OPS.",
        title: parsed.title,
        owner: parsed.owner,
        due: parsed.due,
        description: parsed.description,
        project: parsed.project ?? null,
        status: parsed.status,
        dayIndex: parsed.dayIndex,
        weekOffset: parsed.weekOffset,
        linked: parsed.linked,
      };
    } else {
      action = {
        type: "create_client",
        execution: "execute",
        reason: "Création explicitement demandée depuis le CRM OPS.",
        name: parsed.name,
        status: parsed.status,
        owner: parsed.owner,
        revenue: parsed.revenue,
        margin: parsed.margin,
        health: parsed.health,
        last: parsed.last,
        opportunity: parsed.opportunity,
        email: parsed.email ?? null,
        linked: parsed.linked,
      };
    }

    const result = await executeControlledOpsAction(action, {
      idempotencyKey: request.headers.get("idempotency-key")?.trim() || undefined,
      requestedBy: "marie-delmas",
      approvedBy: "Marie Delmas",
      projectToObsidian: (candidate, context) => (
        projectOpsAgentActionToObsidian(candidate as OpsAgentAction, context)
      ),
    });
    return NextResponse.json(
      {
        record: createdRecordPayload(result.projection),
        action: {
          id: result.actionRunId,
          status: result.status,
          idempotencyKey: result.idempotencyKey,
          receipt: result.receipt ?? null,
        },
      },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof ControlledActionError) {
      const status = error.code === "unsafe_email_recipient"
        || error.code === "validation_required"
        ? 409
        : 503;
      return NextResponse.json(
        { error: error.code },
        { status, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      { error: "record_write_failed" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
