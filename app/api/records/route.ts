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
  type ObsidianWriteResult,
} from "@/lib/obsidian-write";

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
  if (/^TASK-/i.test(record.id)) return "task";
  if (/^(?:CLI|CLIENT)-/i.test(record.id)) return "client";
  return "";
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

  try {
    const root = await resolveOpsDemoVaultRoot();
    const index = await buildObsidianVaultIndex(root);
    const records = index.records
      .filter((record) => !kind || inferRecordKind(record) === kind)
      .filter((record) => !isArchivedRecord(record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(recordPayload);
    return NextResponse.json({ records }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[records] Unable to read the Obsidian vault.", error);
    return NextResponse.json(
      { error: "vault_read_failed" },
      { status: 503, headers: noStoreHeaders },
    );
  }
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
    const root = await resolveOpsDemoVaultRoot();
    const index = await buildObsidianVaultIndex(root);
    const record = findObsidianMemoryRecord(index, parsed.id);
    if (!record || record.id.toLocaleUpperCase("fr") !== parsed.id.toLocaleUpperCase("fr")) {
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
    let result: ObsidianWriteResult;

    if (parsed.kind === "email") {
      const status = parsed.status ?? stringAttribute(record, "status", "draft") as "draft" | "to_process" | "sent_demo";
      const validated = parsed.validated ?? booleanAttribute(record, "validated");
      if (status === "sent_demo" && !validated) {
        return NextResponse.json(
          { error: "validation_required" },
          { status: 409, headers: noStoreHeaders },
        );
      }
      const to = parsed.to ?? stringAttribute(record, "recipient", "destinataire@exemple.fr");
      const from = parsed.from ?? stringAttribute(record, "sender", "Marie Delmas <marie@atelier-beaumarchais.fr>");
      const body = parsed.body ?? currentEmailBody(record);
      result = await updateObsidianRecord({
        id: record.id,
        idPrefix: "EMAIL",
        folder: "04_Conversations/Emails",
        type: "document",
        title: parsed.subject ?? record.title,
        summary: status === "sent_demo"
          ? `Email de démonstration envoyé à ${to}.`
          : `Email à traiter avec ${to}.`,
        body: `## Message\n\nDe : ${from}\n\nÀ : ${to}\n\n${body}`,
        relations: parsed.linked ?? record.relations,
        attributes: {
          record_kind: "email",
          direction: stringAttribute(record, "direction", "outbound"),
          mailbox: parsed.mailbox ?? stringAttribute(record, "mailbox", status === "sent_demo" ? "sent" : "inbox"),
          classification: parsed.classification ?? stringAttribute(record, "classification", "neutral"),
          status,
          recipient: to,
          sender: from,
          company: parsed.company ?? stringAttribute(record, "company"),
          thread_id: parsed.threadId ?? stringAttribute(record, "thread_id"),
          sent_at: stringAttribute(record, "sent_at"),
          validated,
          archived,
        },
      });
    } else if (parsed.kind === "opportunity") {
      const amount = parsed.amount ?? numberAttribute(record, "amount");
      const stage = parsed.stage ?? stringAttribute(record, "stage", "Qualification");
      const probability = parsed.probability ?? numberAttribute(record, "probability");
      const owner = parsed.owner ?? stringAttribute(record, "owner", "Marie");
      const source = parsed.source ?? stringAttribute(record, "source_channel", "OPS");
      const next = parsed.next ?? stringAttribute(record, "next_action", "À définir");
      const title = parsed.name ?? record.title;
      result = await updateObsidianRecord({
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
      });
    } else if (parsed.kind === "task") {
      const title = parsed.title ?? record.title;
      const owner = parsed.owner ?? stringAttribute(record, "owner", "Marie");
      const due = parsed.due ?? stringAttribute(record, "due", "À planifier");
      const status = parsed.status ?? stringAttribute(record, "status", "open");
      const description = parsed.description ?? record.summary;
      const project = parsed.project ?? stringAttribute(record, "project");
      const dayIndex = parsed.dayIndex ?? numberAttribute(record, "day_index");
      const weekOffset = parsed.weekOffset ?? numberAttribute(record, "week_offset");
      result = await updateObsidianRecord({
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
      });
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
      result = await updateObsidianRecord({
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
      });
    }

    return NextResponse.json(
      { record: createdRecordPayload(result) },
      { headers: noStoreHeaders },
    );
  } catch (error) {
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
    if (parsed.kind === "email") {
      if (parsed.status === "sent_demo" && !parsed.validated) {
        return NextResponse.json(
          { error: "validation_required" },
          { status: 409, headers: noStoreHeaders },
        );
      }
      const result = await writeObsidianRecord({
        idPrefix: parsed.status === "sent_demo" ? "EMAIL-SENT" : "EMAIL-DRAFT",
        folder: parsed.status === "sent_demo"
          ? "04_Conversations/Emails/Envoyes"
          : "04_Conversations/Emails/Brouillons",
        type: "document",
        title: parsed.subject,
        summary: parsed.status === "sent_demo"
          ? `Email de démonstration envoyé à ${parsed.to}.`
          : `Brouillon d'email préparé pour ${parsed.to}.`,
        body: `## Message

De : ${parsed.from}

À : ${parsed.to}

${parsed.body}`,
        relations: [parsed.threadId ?? "", ...parsed.linked].filter(Boolean),
        attributes: {
          record_kind: "email",
          direction: "outbound",
          mailbox: parsed.status === "sent_demo" ? "sent" : parsed.mailbox,
          classification: parsed.classification,
          status: parsed.status,
          recipient: parsed.to,
          sender: parsed.from,
          company: parsed.company ?? "",
          thread_id: parsed.threadId ?? "",
          sent_at: parsed.status === "sent_demo" ? new Date().toISOString() : "",
          validated: parsed.validated,
        },
      });
      return NextResponse.json(
        { record: createdRecordPayload(result) },
        { status: 201, headers: noStoreHeaders },
      );
    }

    if (parsed.kind === "opportunity") {
      const result = await writeObsidianRecord({
        idPrefix: "OPP",
        folder: "03_CRM/Opportunites",
        type: "project",
        title: parsed.name,
        summary: `Opportunité de ${parsed.amount.toLocaleString("fr-FR")} € au stade ${parsed.stage}, origine ${parsed.source}.`,
        body: `## Données commerciales

- Montant : ${parsed.amount.toLocaleString("fr-FR")} €.
- Étape : ${parsed.stage}.
- Probabilité : ${parsed.probability} %.
- Responsable : ${parsed.owner}.
- Source : ${parsed.source}.
- Prochaine action : ${parsed.next}.`,
        relations: parsed.linked,
        attributes: {
          record_kind: "opportunity",
          amount: parsed.amount,
          stage: parsed.stage,
          probability: parsed.probability,
          owner: parsed.owner,
          source_channel: parsed.source,
          next_action: parsed.next,
          company: parsed.company ?? "",
          status: "open",
        },
      });
      return NextResponse.json(
        { record: createdRecordPayload(result) },
        { status: 201, headers: noStoreHeaders },
      );
    }

    if (parsed.kind === "task") {
      const result = await writeObsidianRecord({
        idPrefix: "TASK",
        folder: "06_Operations/Taches",
        type: "project",
        title: parsed.title,
        summary: parsed.description,
        body: `## Exécution

- Responsable : ${parsed.owner}.
- Échéance : ${parsed.due}.
- Statut : ${parsed.status}.
${parsed.project ? `- Projet : ${parsed.project}.` : ""}
- Semaine relative : ${parsed.weekOffset}.
${typeof parsed.dayIndex === "number" ? `- Jour ouvré : ${parsed.dayIndex + 1}.` : ""}`,
        relations: parsed.linked,
        attributes: {
          record_kind: "task",
          owner: parsed.owner,
          due: parsed.due,
          status: parsed.status,
          project: parsed.project ?? "",
          day_index: parsed.dayIndex ?? null,
          week_offset: parsed.weekOffset,
        },
      });
      return NextResponse.json(
        { record: createdRecordPayload(result) },
        { status: 201, headers: noStoreHeaders },
      );
    }

    const result = await writeObsidianRecord({
      idPrefix: "CLI",
      folder: "03_CRM/Clients",
      type: "client",
      title: parsed.name,
      summary: `${parsed.name} est un compte ${parsed.status.toLocaleLowerCase("fr")} suivi par ${parsed.owner}.`,
      body: `## Situation du compte

- Statut : ${parsed.status}.
- Responsable : ${parsed.owner}.
- Chiffre d'affaires sur 12 mois : ${parsed.revenue.toLocaleString("fr-FR")} €.
- Marge moyenne : ${parsed.margin.toLocaleString("fr-FR")} %.
- Santé du compte : ${parsed.health} / 100.
- Dernier échange : ${parsed.last}.
- Prochaine opportunité ou action : ${parsed.opportunity}.
${parsed.email ? `- Email principal : ${parsed.email}.` : ""}`,
      relations: parsed.linked,
      attributes: {
        record_kind: "client",
        status: parsed.status,
        owner: parsed.owner,
        revenue_12m: parsed.revenue,
        margin_percent: parsed.margin,
        health_score: parsed.health,
        last_interaction: parsed.last,
        next_opportunity: parsed.opportunity,
        email: parsed.email ?? "",
      },
    });
    return NextResponse.json(
      { record: createdRecordPayload(result) },
      { status: 201, headers: noStoreHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "record_write_failed" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
