import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyKnowledgeEvents,
  createKnowledgeState,
  findEntityByIdentifier,
  type KnowledgeAccess,
  type KnowledgeEvent,
  type KnowledgePayload,
  type KnowledgeSource,
} from "./ops-knowledge-pipeline";
import { projectKnowledgeToObsidian } from "./ops-obsidian-projector";

const internal: KnowledgeAccess = { confidentiality: "internal", allowedGroups: ["direction", "commercial"] };

function event(
  source: KnowledgeSource,
  sourceRecordId: string,
  sourceVersion: string,
  observedAt: string,
  payload: KnowledgePayload,
  options: Partial<KnowledgeEvent> = {},
): KnowledgeEvent {
  return {
    eventId: `${source}-${sourceRecordId}-${sourceVersion}-${observedAt}`,
    tenantId: "vitreflam-demo",
    source,
    sourceRecordId,
    sourceVersion,
    operation: "upsert",
    observedAt,
    access: internal,
    payload,
    ...options,
  };
}

const company = (ref = "company") => ({
  ref,
  kind: "organization" as const,
  name: "Vitreflam SAS",
  identifiers: [
    { scheme: "domain" as const, value: "vitreflam.fr" },
    { scheme: "siret" as const, value: "123 456 789 00012" },
  ],
});

const fabien = (ref = "fabien") => ({
  ref,
  kind: "person" as const,
  name: "Fabien Martin",
  identifiers: [{ scheme: "email" as const, value: "Fabien@Vitreflam.fr" }],
});

test("résout Vitreflam et Fabien entre toutes les sources et agrège les emails", () => {
  const inputs: KnowledgeEvent[] = [
    event("crm", "account-42", "1", "2026-07-16T08:00:00Z", {
      entities: [company(), fabien()],
      facts: [
        { subjectRef: "company", predicate: "segment", value: "client B2B" },
        { subjectRef: "fabien", predicate: "fonction", value: "Directeur général" },
      ],
      relations: [{ fromRef: "fabien", toRef: "company", type: "works_for" }],
      metrics: [{ subjectRef: "company", key: "pipeline", name: "Pipeline", value: 85000, unit: "EUR", periodEnd: "2026-07-31" }],
    }),
    event("email", "thread-77-message-1", "1", "2026-07-16T09:00:00Z", {
      entities: [
        { ...fabien("sender"), name: "Fabien" },
        { ...company("account"), name: "VITREFLAM" },
      ],
      facts: [{ subjectRef: "account", predicate: "segment", value: "client B2B" }],
      relations: [{ fromRef: "sender", toRef: "account", type: "works_for" }],
      commitments: [{ key: "send-dimensions", ownerRef: "sender", beneficiaryRef: "account", action: "Envoyer les dimensions définitives", dueAt: "2026-07-18" }],
    }),
    event("email", "thread-77-message-2", "1", "2026-07-16T09:20:00Z", {
      entities: [fabien("sender"), company("account")],
      tasks: [{ key: "prepare-quote", subjectRef: "account", ownerRef: "sender", title: "Préparer le devis coupe-feu", dueAt: "2026-07-21" }],
    }),
    event("slack", "channel-sales-882", "3", "2026-07-16T10:00:00Z", {
      entities: [company(), fabien()],
      decisions: [{ key: "pilot", subjectRef: "company", decidedByRef: "fabien", decision: "Lancer un pilote sur deux sites", status: "approved" }],
    }),
    event("teams", "meeting-chat-19", "1", "2026-07-16T10:15:00Z", {
      entities: [company()],
      facts: [{ subjectRef: "company", predicate: "sites_pilotes", value: 2 }],
    }),
    event("notion", "strategy-vitreflam", "8", "2026-07-16T11:00:00Z", {
      entities: [company()],
      notes: [{ key: "vitreflam-account-plan", title: "Plan de compte Vitreflam", summary: "Compte prioritaire pour le trimestre.", body: "Le pilote doit démontrer la baisse du délai de pose.", entityRefs: ["company"], topic: "commercial" }],
    }),
    event("drive", "proposal-v4", "4", "2026-07-16T11:20:00Z", {
      entities: [company(), { ref: "proposal", kind: "document", name: "Proposition Vitreflam v4", identifiers: [{ scheme: "external", value: "drive:file:proposal-v4" }] }],
      relations: [{ fromRef: "proposal", toRef: "company", type: "proposal_for" }],
    }),
    event("calendar", "pilot-kickoff", "2", "2026-07-16T12:00:00Z", {
      entities: [company(), fabien()],
      tasks: [{ key: "kickoff", subjectRef: "company", ownerRef: "fabien", title: "Réunion de lancement", dueAt: "2026-07-22T09:00:00+02:00" }],
    }),
    event("seo", "trustpilot-vitreflam", "15", "2026-07-16T13:00:00Z", {
      entities: [company(), { ref: "trustpilot", kind: "channel", name: "Trustpilot Vitreflam", identifiers: [{ scheme: "url", value: "https://fr.trustpilot.com/review/vitreflam.fr" }] }],
      relations: [{ fromRef: "trustpilot", toRef: "company", type: "reputation_profile_of" }],
      metrics: [
        { subjectRef: "company", key: "trustpilot-rating", name: "Note Trustpilot", value: 4.6, unit: "/5", periodEnd: "2026-07-16" },
        { subjectRef: "company", key: "trustpilot-reviews", name: "Avis Trustpilot", value: 128, unit: "avis", periodEnd: "2026-07-16" },
      ],
    }),
    event("ads", "google-vitreflam", "9", "2026-07-16T14:00:00Z", {
      entities: [company()],
      metrics: [{ subjectRef: "company", key: "ads-spend", name: "Dépense Google Ads", value: 2400, unit: "EUR", periodStart: "2026-07-01", periodEnd: "2026-07-16" }],
    }),
    event("finance", "invoice-ledger-vitreflam", "6", "2026-07-16T15:00:00Z", {
      entities: [company()],
      metrics: [{ subjectRef: "company", key: "revenue-ytd", name: "CA facturé YTD", value: 142000, unit: "EUR", periodStart: "2026-01-01", periodEnd: "2026-07-16" }],
    }),
  ];

  const state = applyKnowledgeEvents(createKnowledgeState("vitreflam-demo"), inputs);
  const resolvedCompany = findEntityByIdentifier(state, "domain", "www.vitreflam.fr");
  const resolvedFabien = findEntityByIdentifier(state, "email", "fabien@vitreflam.fr");
  assert.ok(resolvedCompany);
  assert.ok(resolvedFabien);
  assert.equal(state.entities.filter((item) => item.kind === "organization").length, 1);
  assert.equal(state.entities.filter((item) => item.kind === "person").length, 1);
  assert.equal(state.facts.find((item) => item.predicate === "segment")?.provenance.length, 2);
  assert.equal(state.metrics.find((item) => item.name === "Note Trustpilot")?.value, 4.6);
  assert.equal(state.commitments.length, 1);
  assert.equal(state.decisions.length, 1);
  assert.equal(state.tasks.length, 2);
  assert.deepEqual(new Set(Object.values(state.contributions).map((item) => item.event.source)), new Set([
    "crm", "email", "slack", "teams", "notion", "drive", "calendar", "seo", "ads", "finance",
  ]));

  const emailNotes = state.notes.filter((note) => note.provenance.some((source) => source.source === "email"));
  assert.ok(emailNotes.length > 0);
  assert.ok(emailNotes.length < 2 + state.contributions["vitreflam-demo:email:thread-77-message-1"]!.event.payload!.entities.length);
  assert.equal(state.notes.some((note) => /message-1|message-2/i.test(note.title)), false);
});

test("gère upserts, événements obsolètes, suppressions et partitions confidentielles", () => {
  const initial = event("finance", "vitreflam-kpis", "1", "2026-07-16T08:00:00Z", {
    entities: [company()],
    metrics: [{ subjectRef: "company", key: "revenue", name: "CA mensuel", value: 41000, unit: "EUR", periodEnd: "2026-07-31" }],
  });
  const updated = event("finance", "vitreflam-kpis", "2", "2026-07-16T09:00:00Z", {
    entities: [company()],
    metrics: [{ subjectRef: "company", key: "revenue", name: "CA mensuel", value: 43600, unit: "EUR", periodEnd: "2026-07-31" }],
  });
  const stale = event("finance", "vitreflam-kpis", "1.5", "2026-07-16T08:30:00Z", {
    entities: [company()],
    metrics: [{ subjectRef: "company", key: "revenue", name: "CA mensuel", value: 42000, unit: "EUR", periodEnd: "2026-07-31" }],
  });
  const privateDecision = event("notion", "compensation-fabien", "1", "2026-07-16T09:30:00Z", {
    entities: [company(), fabien()],
    decisions: [{ key: "fabien-bonus", subjectRef: "company", decidedByRef: "fabien", decision: "Valider le bonus annuel de Fabien" }],
  }, {
    access: { confidentiality: "restricted", allowedGroups: ["direction", "rh"], containsPersonalData: true },
  });

  let state = applyKnowledgeEvents(createKnowledgeState("vitreflam-demo"), [initial, updated, stale, privateDecision]);
  assert.equal(state.metrics[0]?.value, 43600);
  assert.equal(state.journal.some((entry) => entry.action === "ignored_stale"), true);
  const restricted = state.notes.find((note) => note.access.confidentiality === "restricted");
  const regular = state.notes.find((note) => note.access.confidentiality === "internal" && note.entityIds.includes(state.metrics[0]!.subjectId));
  assert.ok(restricted?.body.includes("bonus annuel"));
  assert.equal(regular?.body.includes("bonus annuel"), false);
  assert.deepEqual(restricted?.access.allowedGroups, ["direction", "rh"]);

  const deletion: KnowledgeEvent = {
    eventId: "finance-delete-v3",
    tenantId: "vitreflam-demo",
    source: "finance",
    sourceRecordId: "vitreflam-kpis",
    sourceVersion: "3",
    operation: "delete",
    observedAt: "2026-07-16T10:00:00Z",
    access: internal,
  };
  state = applyKnowledgeEvents(state, [deletion, deletion]);
  assert.equal(state.metrics.length, 0);
  assert.equal(state.sourceClocks["vitreflam-demo:finance:vitreflam-kpis"]?.deleted, true);
  assert.equal(state.journal.filter((entry) => entry.eventId === deletion.eventId).length, 1);
});

test("projette un vault Obsidian idempotent sans créer une note par email", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ops-knowledge-"));
  try {
    const events = [
      event("crm", "vitreflam", "1", "2026-07-16T08:00:00Z", {
        entities: [company(), fabien()],
        relations: [{ fromRef: "fabien", toRef: "company", type: "works_for" }],
      }),
      event("email", "mail-a", "1", "2026-07-16T09:00:00Z", {
        entities: [company(), fabien()],
        facts: [{ subjectRef: "company", predicate: "prochaine_action", value: "Relancer Fabien vendredi" }],
      }),
      event("email", "mail-b", "1", "2026-07-16T09:05:00Z", {
        entities: [company(), fabien()],
        commitments: [{ key: "documents", ownerRef: "fabien", beneficiaryRef: "company", action: "Envoyer le dossier technique", dueAt: "2026-07-18" }],
      }),
      event("seo", "trustpilot", "1", "2026-07-16T10:00:00Z", {
        entities: [company()],
        metrics: [{ subjectRef: "company", key: "trustpilot", name: "Note Trustpilot", value: 4.6, unit: "/5" }],
      }),
    ];
    const state = applyKnowledgeEvents(createKnowledgeState("vitreflam-demo"), events);
    await fs.writeFile(path.join(root, "note-utilisateur.md"), "Ne jamais supprimer.\n", "utf8");
    const first = await projectKnowledgeToObsidian(state, root);
    assert.ok(first.created.length >= 4);
    const projected = await fs.readdir(path.join(root, "Knowledge", "Entities"));
    assert.equal(projected.some((name) => /mail-a|mail-b/i.test(name)), false);
    assert.ok(projected.length <= state.entities.length * 2);

    const second = await projectKnowledgeToObsidian(state, root);
    assert.equal(second.created.length, 0);
    assert.equal(second.updated.length, 0);
    assert.equal(second.deleted.length, 0);
    assert.equal(second.unchanged.length, first.created.length);
    assert.equal(await fs.readFile(path.join(root, "note-utilisateur.md"), "utf8"), "Ne jamais supprimer.\n");

    const journal = await fs.readFile(path.join(root, "System", "Journal.md"), "utf8");
    const provenance = await fs.readFile(path.join(root, "System", "Provenance.md"), "utf8");
    assert.match(journal, /email:mail-a|vitreflam-demo:email:mail-a/);
    assert.match(provenance, /trustpilot/);
    assert.match(provenance, /confidentialit/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
