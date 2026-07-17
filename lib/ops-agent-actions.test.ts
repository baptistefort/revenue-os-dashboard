import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isExplicitAgentActionRequest,
  opsAgentActionsSchema,
  parseOpsAgentActionEnvelopes,
  resolveOpsAgentActions,
  type OpsAgentAction,
} from "@/lib/ops-agent-actions";

const opportunity: OpsAgentAction = {
  type: "create_opportunity",
  execution: "execute",
  reason: "Marie demande d'ajouter l'affaire au pipeline.",
  name: "Extension Galerie Voltaire",
  amount: 48_000,
  stage: "Qualification",
  probability: 35,
  owner: "Camille Laurent",
  source: "Recommandation",
  next: "Planifier la visite technique",
  company: "Galerie Voltaire",
  linked: ["CRM-SNAPSHOT-20260715"],
};

const email: OpsAgentAction = {
  type: "send_demo_email",
  execution: "execute",
  reason: "Marie ordonne l'envoi de démonstration.",
  subject: "Compte rendu de notre échange",
  to: "direction@galerie-voltaire.fr",
  body: "Bonjour, voici le compte rendu convenu.",
  company: "Galerie Voltaire",
  threadId: null,
  linked: [],
};

test("le schéma borne les cinq actions agentiques et refuse les formes libres", () => {
  const actions = opsAgentActionsSchema.parse([
    opportunity,
    {
      type: "create_task",
      execution: "propose",
      reason: "Action suggérée après l'analyse.",
      title: "Vérifier le budget",
      owner: "Marie Delmas",
      due: "2026-07-18",
      description: "Comparer le réalisé au budget validé.",
      project: "Rivoli",
      linked: ["PROJET-241"],
    },
    {
      type: "prepare_email",
      execution: "execute",
      reason: "Marie demande un brouillon.",
      subject: "Relance douce",
      to: "sophie@example.fr",
      body: "Bonjour Sophie, je reviens vers vous.",
      company: null,
      threadId: "EMAIL-901",
      linked: ["EMAIL-901"],
    },
  ]);
  assert.equal(actions.length, 3);

  assert.equal(opsAgentActionsSchema.safeParse([
    ...actions,
    opportunity,
  ]).success, false);
  assert.equal(opsAgentActionsSchema.safeParse([{
    type: "run_shell",
    execution: "execute",
    reason: "Interdit",
    command: "rm -rf /",
  }]).success, false);
});

test("l'enveloppe OpenCode simple est revalidée en action strictement typée", () => {
  const parsed = parseOpsAgentActionEnvelopes([{
    type: "create_opportunity",
    execution: "execute",
    reason: opportunity.reason,
    payload: JSON.stringify({
      name: opportunity.name,
      amount: opportunity.amount,
      stage: opportunity.stage,
      probability: opportunity.probability,
      owner: opportunity.owner,
      source: opportunity.source,
      next: opportunity.next,
      company: opportunity.company,
      linked: opportunity.linked,
    }),
  }]);
  assert.deepEqual(parsed, [opportunity]);

  assert.deepEqual(parseOpsAgentActionEnvelopes([{
    type: "create_task",
    execution: "execute",
    reason: "Payload invalide",
    payload: "{not-json}",
  }]), []);
});

test("le garde-fou reconnaît une commande explicite, pas une réflexion ni une négation", () => {
  assert.equal(
    isExplicitAgentActionRequest("Crée une opportunité de 48 000 € pour Galerie Voltaire", "create_opportunity"),
    true,
  );
  assert.equal(
    isExplicitAgentActionRequest("Que penses-tu de créer une opportunité pour Galerie Voltaire ?", "create_opportunity"),
    false,
  );
  assert.equal(
    isExplicitAgentActionRequest("Ne crée pas d'opportunité pour le moment", "create_opportunity"),
    false,
  );
  assert.equal(
    isExplicitAgentActionRequest("Prépare un email, mais ne l'envoie pas", "prepare_email"),
    true,
  );
  assert.equal(
    isExplicitAgentActionRequest("Prépare un email, mais ne l'envoie pas", "send_demo_email"),
    false,
  );
  assert.equal(
    isExplicitAgentActionRequest("Oui, vas-y", "create_task"),
    true,
  );
});

test("une action explicitement ordonnée est persistée une seule fois", async () => {
  const persisted: OpsAgentAction[] = [];
  const results = await resolveOpsAgentActions(
    [opportunity],
    "Crée une opportunité pour Galerie Voltaire",
    async (action) => {
      persisted.push(action);
      return {
        id: "OPP-TEST-001",
        title: "Extension Galerie Voltaire",
        relativePath: "03_CRM/Opportunites/OPP-TEST-001.md",
        absolutePath: "/tmp/OPP-TEST-001.md",
        createdAt: "2026-07-16T18:00:00.000Z",
      };
    },
  );

  assert.equal(persisted.length, 1);
  assert.equal(results[0].status, "executed");
  assert.equal(results[0].demoOnly, true);
  assert.equal(results[0].record?.id, "OPP-TEST-001");
});

test("une suggestion reste proposée et une fausse autorisation exige une validation", async () => {
  let persistenceCalls = 0;
  const persist = async () => {
    persistenceCalls += 1;
    throw new Error("ne doit pas être appelé");
  };

  const proposed = await resolveOpsAgentActions(
    [{ ...opportunity, execution: "propose" }],
    "Crée une opportunité pour Galerie Voltaire",
    persist,
  );
  assert.equal(proposed[0].status, "proposed");

  const unapproved = await resolveOpsAgentActions(
    [opportunity],
    "Faut-il créer une opportunité pour Galerie Voltaire ?",
    persist,
  );
  assert.equal(unapproved[0].status, "validation_required");
  assert.equal(persistenceCalls, 0);
});

test("send_demo_email ne peut écrire qu'après un ordre d'envoi explicite", async () => {
  let persistenceCalls = 0;
  const persist = async () => {
    persistenceCalls += 1;
    return {
      id: "EMAIL-SENT-TEST-001",
      title: email.subject,
      relativePath: "04_Conversations/Emails/Envoyes/EMAIL-SENT-TEST-001.md",
      absolutePath: "/tmp/EMAIL-SENT-TEST-001.md",
      createdAt: "2026-07-16T18:00:00.000Z",
    };
  };

  const draftOnly = await resolveOpsAgentActions(
    [email],
    "Prépare cet email",
    persist,
  );
  assert.equal(draftOnly[0].status, "validation_required");

  const sentDemo = await resolveOpsAgentActions(
    [email],
    "Envoie cet email maintenant",
    persist,
  );
  assert.equal(sentDemo[0].status, "executed");
  assert.equal(persistenceCalls, 1);
});

test("la persistance agentique écrit directement dans Obsidian sans fetch interne", async () => {
  const source = await readFile(new URL("./ops-agent-actions.ts", import.meta.url), "utf8");
  assert.match(source, /writeObsidianRecord/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\/api\/records/);
});
