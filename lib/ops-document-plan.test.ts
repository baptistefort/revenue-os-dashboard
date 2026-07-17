import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentPlanFromAgent } from "@/lib/ops-document-plan";

test("construit un plan PDF fidèle à la réponse sourcée de l'agent", () => {
  const plan = buildDocumentPlanFromAgent({
    prompt: "Génère maintenant le vrai PDF CODIR sur le SEO",
    answer: [
      "Résumé exécutif : le trafic progresse et deux redirections doivent être corrigées.",
      "1. Faits : 428 clics et 14 leads qualifiés.",
      "2. Plan d'action :\n- Corriger les redirections\n- Publier la page cible",
    ].join("\n\n"),
    sources: ["RAPPORT-SEO-001"],
    artifact: {
      kicker: "Décision",
      title: "SEO — exécution sur 7 jours",
      metrics: [{ label: "Clics", value: "428" }],
      action: "Valider le plan sous la responsabilité de Camille.",
    },
  });

  assert.equal(plan.title, "SEO — exécution sur 7 jours");
  assert.match(plan.executiveSummary, /trafic progresse/);
  assert.deepEqual(plan.sources, ["RAPPORT-SEO-001"]);
  assert.ok(plan.sections.some((section) => section.title === "Faits"));
  assert.ok(plan.sections.some((section) => section.bullets.includes("Corriger les redirections")));
  assert.equal(plan.decisions[0]?.indicator, "Clics : 428");
});

test("ne fabrique aucun fait métier lorsque l'agent ne fournit qu'un texte simple", () => {
  const plan = buildDocumentPlanFromAgent({
    prompt: "Fais-moi un PDF",
    answer: "Contenu confirmé par la mémoire.",
    sources: [],
  });

  assert.match(plan.title, /^Rapport OPS|^Rapport de direction/);
  assert.deepEqual(plan.sections[0]?.paragraphs, ["Contenu confirmé par la mémoire."]);
  assert.deepEqual(plan.decisions, []);
  assert.deepEqual(plan.sources, []);
});
