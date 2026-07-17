import { z } from "zod";
import { normalizeMemoryQuery } from "@/lib/ops-memory";
import {
  writeObsidianRecord,
  type ObsidianWriteResult,
} from "@/lib/obsidian-write";
import {
  executeControlledOpsAction,
  type ControlledActionProjectionContext,
} from "@/lib/ops-action-executor";

const linkedSchema = z.array(z.string().trim().min(1).max(180)).max(12);
const actionControlFields = {
  execution: z.enum(["propose", "execute"]),
  reason: z.string().trim().min(1).max(320),
};
const emailFields = {
  subject: z.string().trim().min(1).max(180),
  to: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(20_000),
  company: z.string().trim().max(180).nullable(),
  threadId: z.string().trim().max(100).nullable(),
  linked: linkedSchema,
};

export const opsAgentActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_opportunity"),
    ...actionControlFields,
    name: z.string().trim().min(1).max(180),
    amount: z.number().finite().min(0).max(100_000_000),
    stage: z.enum(["Qualification", "Découverte", "Proposition", "Négociation"]),
    probability: z.number().finite().min(0).max(100),
    owner: z.string().trim().min(1).max(120),
    source: z.string().trim().min(1).max(120),
    next: z.string().trim().min(1).max(240),
    company: z.string().trim().max(180).nullable(),
    linked: linkedSchema,
  }),
  z.object({
    type: z.literal("create_task"),
    ...actionControlFields,
    title: z.string().trim().min(1).max(180),
    owner: z.string().trim().min(1).max(120),
    due: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(8_000),
    project: z.string().trim().max(180).nullable(),
    status: z.enum(["open", "in_progress", "done"]).optional(),
    dayIndex: z.number().int().min(0).max(4).optional(),
    weekOffset: z.number().int().min(-52).max(52).optional(),
    linked: linkedSchema,
  }),
  z.object({
    type: z.literal("create_client"),
    ...actionControlFields,
    name: z.string().trim().min(1).max(180),
    status: z.enum(["Actif", "À risque", "À suivre", "Dormant", "Prospect"]),
    owner: z.string().trim().min(1).max(120),
    revenue: z.number().finite().min(0).max(100_000_000),
    margin: z.number().finite().min(-100).max(100),
    health: z.number().finite().min(0).max(100),
    last: z.string().trim().min(1).max(120),
    opportunity: z.string().trim().min(1).max(240),
    email: z.string().trim().email().max(240).nullable(),
    linked: linkedSchema,
  }),
  z.object({
    type: z.literal("prepare_email"),
    ...actionControlFields,
    ...emailFields,
  }),
  z.object({
    type: z.literal("send_demo_email"),
    ...actionControlFields,
    ...emailFields,
  }),
]);

export const opsAgentActionsSchema = z.array(opsAgentActionSchema).max(3);

/**
 * OpenCode 1.18 does not reliably expose a JSON-schema output tool when the
 * schema contains a discriminated `oneOf`. Keep the provider envelope simple,
 * then validate its serialized payload against the strict typed union above
 * before any action reaches the safety gate.
 */
export const opsAgentActionEnvelopeSchema = z.object({
  type: z.enum([
    "create_opportunity",
    "create_task",
    "create_client",
    "prepare_email",
    "send_email",
    "send_demo_email",
  ]),
  execution: z.enum(["propose", "execute"]),
  reason: z.string().trim().min(1).max(320),
  payload: z.string().trim().min(2).max(24_000),
});

export const opsAgentActionEnvelopesSchema = z
  .array(opsAgentActionEnvelopeSchema)
  .max(3);

export type OpsAgentActionEnvelope = z.output<typeof opsAgentActionEnvelopeSchema>;

export type OpsAgentAction = z.output<typeof opsAgentActionSchema>;
export type OpsAgentActionType = OpsAgentAction["type"];
export type OpsAgentActionStatus =
  | "proposed"
  | "validation_required"
  | "executed"
  | "failed";

export type OpsAgentActionResult = {
  type: OpsAgentActionType;
  requestedExecution: OpsAgentAction["execution"];
  status: OpsAgentActionStatus;
  demoOnly: true;
  reason: string;
  proposal: OpsAgentAction;
  record?: {
    id: string;
    title: string;
    path: string;
    createdAt: string;
  };
  error?: "persistence_failed";
};

export type OpsAgentActionPersistence = (
  action: OpsAgentAction,
) => Promise<ObsidianWriteResult>;

export function parseOpsAgentActionEnvelopes(
  envelopes: OpsAgentActionEnvelope[],
) {
  const actions: OpsAgentAction[] = [];
  for (const envelope of envelopes.slice(0, 3)) {
    let payload: unknown;
    try {
      payload = JSON.parse(envelope.payload) as unknown;
    } catch {
      continue;
    }
    const parsed = opsAgentActionSchema.safeParse({
      ...((payload && typeof payload === "object") ? payload : {}),
      // `send_demo_email` remains the public UI alias until every consumer has
      // migrated. The executor always persists the canonical `send_email`.
      type: envelope.type === "send_email" ? "send_demo_email" : envelope.type,
      execution: envelope.execution,
      reason: envelope.reason,
    });
    if (parsed.success) actions.push(parsed.data);
  }
  return actions;
}

function formatEuro(value: number) {
  return `${value.toLocaleString("fr-FR")} €`;
}

/**
 * Commits an approved internal demo action directly into the Obsidian vault.
 * This intentionally never calls the application's own HTTP routes and never
 * contacts an email provider, CRM or other external service.
 */
export async function projectOpsAgentActionToObsidian(
  action: OpsAgentAction,
  context?: ControlledActionProjectionContext,
): Promise<ObsidianWriteResult> {
  if (action.type === "create_opportunity") {
    return writeObsidianRecord({
      id: context?.recordId,
      idPrefix: "OPP",
      folder: "03_CRM/Opportunites",
      type: "project",
      title: action.name,
      summary: `Opportunité de ${formatEuro(action.amount)} au stade ${action.stage}, origine ${action.source}.`,
      body: `## Données commerciales

- Montant : ${formatEuro(action.amount)}.
- Étape : ${action.stage}.
- Probabilité : ${action.probability} %.
- Responsable : ${action.owner}.
- Source : ${action.source}.
- Prochaine action : ${action.next}.`,
      relations: action.linked,
      attributes: {
        record_kind: "opportunity",
        amount: action.amount,
        stage: action.stage,
        probability: action.probability,
        owner: action.owner,
        source_channel: action.source,
        next_action: action.next,
        company: action.company ?? "",
        status: "open",
        agent_created: true,
      },
      source: "OPS Agent — OpenCode",
      actor: "OPS Agent — validation Marie Delmas",
    });
  }

  if (action.type === "create_task") {
    const status = action.status ?? "open";
    return writeObsidianRecord({
      id: context?.recordId,
      idPrefix: "TASK",
      folder: "06_Operations/Taches",
      type: "project",
      title: action.title,
      summary: action.description,
      body: `## Exécution

- Responsable : ${action.owner}.
- Échéance : ${action.due}.
- Statut : ${status}.
${action.project ? `- Projet : ${action.project}.` : ""}`,
      relations: action.linked,
      attributes: {
        record_kind: "task",
        owner: action.owner,
        due: action.due,
        status,
        project: action.project ?? "",
        day_index: action.dayIndex ?? null,
        week_offset: action.weekOffset ?? 0,
        agent_created: true,
      },
      source: "OPS Agent — OpenCode",
      actor: "OPS Agent — validation Marie Delmas",
    });
  }

  if (action.type === "create_client") {
    return writeObsidianRecord({
      id: context?.recordId,
      idPrefix: "CLI",
      folder: "03_CRM/Clients",
      type: "entity",
      title: action.name,
      summary: `${action.name} est un compte ${action.status.toLocaleLowerCase("fr")} suivi par ${action.owner}.`,
      body: `## Situation du compte

- Statut : ${action.status}.
- Responsable : ${action.owner}.
- Chiffre d'affaires sur 12 mois : ${formatEuro(action.revenue)}.
- Marge moyenne : ${action.margin.toLocaleString("fr-FR")} %.
- Santé du compte : ${action.health} / 100.
- Dernier échange : ${action.last}.
- Prochaine opportunité ou action : ${action.opportunity}.
${action.email ? `- Email principal : ${action.email}.` : ""}`,
      relations: action.linked,
      attributes: {
        record_kind: "client",
        status: action.status,
        owner: action.owner,
        revenue_12m: action.revenue,
        margin_percent: action.margin,
        health_score: action.health,
        last_interaction: action.last,
        next_opportunity: action.opportunity,
        email: action.email ?? "",
        agent_created: true,
      },
      source: "OPS Agent — OpenCode",
      actor: "OPS Agent — validation Marie Delmas",
    });
  }

  const sent = action.type === "send_demo_email";
  return writeObsidianRecord({
    id: context?.recordId,
    idPrefix: sent ? "EMAIL-SENT" : "EMAIL-DRAFT",
    folder: sent
      ? "04_Conversations/Emails/Envoyes"
      : "04_Conversations/Emails/Brouillons",
    type: "document",
    title: action.subject,
    summary: sent
      ? `Email remis à la boîte d'envoi contrôlée pour ${action.to}.`
      : `Brouillon d'email préparé pour ${action.to}.`,
    body: `## Message

De : Marie Delmas <marie@atelier-beaumarchais.fr>

À : ${action.to}

${action.body}`,
    relations: [action.threadId ?? "", ...action.linked].filter(Boolean),
    attributes: {
      record_kind: "email",
      direction: "outbound",
      mailbox: sent ? "sent" : "draft",
      classification: "neutral",
      status: sent ? "sent" : "draft",
      recipient: action.to,
      sender: "Marie Delmas <marie@atelier-beaumarchais.fr>",
      company: action.company ?? "",
      thread_id: action.threadId ?? "",
      sent_at: sent ? context?.receipt?.acceptedAt ?? new Date().toISOString() : "",
      validated: sent,
      agent_created: true,
      delivery_mode: sent ? "controlled_internal_outbox" : "draft_only",
      delivery_receipt: context?.receipt?.receiptId ?? "",
      network_delivery: false,
    },
    source: "OPS Agent — OpenCode",
    actor: "OPS Agent — validation Marie Delmas",
  });
}

/**
 * Persists the action in the central PostgreSQL memory before projecting the
 * resulting durable record to Obsidian. Without DATABASE_URL the same API
 * keeps the local Obsidian-only development fallback.
 */
export async function persistOpsAgentAction(
  action: OpsAgentAction,
): Promise<ObsidianWriteResult> {
  const result = await executeControlledOpsAction(action, {
    requestedBy: "marie-delmas",
    approvedBy: "Marie Delmas",
    projectToObsidian: (candidate, context) => (
      projectOpsAgentActionToObsidian(candidate as OpsAgentAction, context)
    ),
  });
  return result.projection;
}

function currentRequestIsNegated(normalized: string, type: OpsAgentActionType) {
  const noun = type === "create_opportunity"
    ? "(?:opportunite|affaire|deal)"
    : type === "create_task"
      ? "(?:tache|mission|action)"
      : type === "create_client"
        ? "(?:client|compte)"
        : "(?:email|mail|message|reponse)";
  return new RegExp(
    `(?:\\bne\\b|\\bn\\b).{0,50}\\b(?:pas|jamais|plus)\\b.{0,80}\\b${noun}\\b|`
    + `\\b(?:sans|aucun)\\b.{0,30}\\b${noun}\\b`,
  ).test(normalized);
}

/**
 * Server-side safety gate. OpenCode may suggest an execution, but only the
 * current user turn can authorize a bounded internal demo write.
 */
export function isExplicitAgentActionRequest(
  message: string,
  type: OpsAgentActionType,
) {
  const normalized = normalizeMemoryQuery(message)
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || currentRequestIsNegated(normalized, type)) return false;

  if (/^(?:oui\s+)?(?:vas[- ]y|go|fais le|execute|confirme|lance)(?:\s+(?:stp|s il te plait))?$/.test(normalized)) {
    return true;
  }

  const wrappers = "(?:peux tu|pourrais tu|est ce que tu peux|tu peux|je veux que tu|merci de|veuillez)";
  const patterns: Record<OpsAgentActionType, RegExp[]> = {
    create_opportunity: [
      /\b(?:cree|ajoute|ouvre|enregistre)\b.{0,100}\b(?:opportunite|affaire|deal)\b/,
      new RegExp(`\\b${wrappers}\\b.{0,30}\\b(?:creer|ajouter|ouvrir|enregistrer)\\b.{0,100}\\b(?:opportunite|affaire|deal)\\b`),
    ],
    create_task: [
      /\b(?:cree|ajoute|assigne|planifie|enregistre)\b.{0,100}\b(?:tache|mission|action)\b/,
      new RegExp(`\\b${wrappers}\\b.{0,30}\\b(?:creer|ajouter|assigner|planifier|enregistrer)\\b.{0,100}\\b(?:tache|mission|action)\\b`),
    ],
    create_client: [
      /\b(?:cree|ajoute|enregistre)\b.{0,100}\b(?:client|compte)\b/,
      new RegExp(`\\b${wrappers}\\b.{0,30}\\b(?:creer|ajouter|enregistrer)\\b.{0,100}\\b(?:client|compte)\\b`),
    ],
    prepare_email: [
      /\b(?:prepare|redige|ecris|compose|reponds)\b.{0,120}\b(?:email|mail|message|reponse)\b/,
      new RegExp(`\\b${wrappers}\\b.{0,30}\\b(?:preparer|rediger|ecrire|composer|repondre)\\b.{0,120}\\b(?:email|mail|message|reponse)\\b`),
    ],
    send_demo_email: [
      /\b(?:envoie|expedie|transmets|fais partir)\b.{0,120}\b(?:email|mail|message|reponse)\b/,
      new RegExp(`\\b${wrappers}\\b.{0,30}\\b(?:envoyer|expedier|transmettre|faire partir)\\b.{0,120}\\b(?:email|mail|message|reponse)\\b`),
    ],
  };
  return patterns[type].some((pattern) => pattern.test(normalized));
}

function recordResult(record: ObsidianWriteResult) {
  return {
    id: record.id,
    title: record.title,
    path: record.relativePath,
    createdAt: record.createdAt,
  };
}

export async function resolveOpsAgentActions(
  actions: OpsAgentAction[],
  currentMessage: string,
  persist: OpsAgentActionPersistence = persistOpsAgentAction,
): Promise<OpsAgentActionResult[]> {
  const results: OpsAgentActionResult[] = [];
  for (const action of actions.slice(0, 3)) {
    const base = {
      type: action.type,
      requestedExecution: action.execution,
      demoOnly: true as const,
      reason: action.reason,
      proposal: action,
    };
    if (action.execution !== "execute") {
      results.push({ ...base, status: "proposed" });
      continue;
    }
    if (!isExplicitAgentActionRequest(currentMessage, action.type)) {
      results.push({ ...base, status: "validation_required" });
      continue;
    }

    try {
      const record = await persist(action);
      results.push({
        ...base,
        status: "executed",
        record: recordResult(record),
      });
    } catch (error) {
      console.error(`[OPS] Agent action persistence failed (${action.type}).`, error);
      results.push({
        ...base,
        status: "failed",
        error: "persistence_failed",
      });
    }
  }
  return results;
}
