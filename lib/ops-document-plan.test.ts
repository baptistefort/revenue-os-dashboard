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

test("transforme le Markdown de l'agent en sections PDF propres et lisibles", () => {
  const plan = buildDocumentPlanFromAgent({
    prompt: "Produis le comparatif SEO en PDF",
    answer: [
      "### Bilan SEO",
      "Le trafic organique progresse sans baisse des conversions.",
      "",
      "- **447 clics** le 16 juillet",
      "- 4 conversions confirmées",
      "",
      "### Comparaison avec la veille",
      "| Indicateur | 16 juillet | 15 juillet | Écart |",
      "|---|---:|---:|---:|",
      "| Clics | **447** | 428 | +19 |",
      "| Impressions | 15 820 | 15 240 | +580 |",
    ].join("\n"),
    sources: ["SEO-SNAPSHOT-20260716", "SEO-SNAPSHOT-20260715"],
  });

  assert.equal(plan.sections[0]?.title, "Bilan SEO");
  assert.ok(plan.sections.every((section) => !section.title.includes("#")));
  assert.deepEqual(plan.sections[0]?.bullets, [
    "447 clics le 16 juillet",
    "4 conversions confirmées",
  ]);
  assert.deepEqual(plan.sections[1]?.bullets, [
    "Indicateur : Clics · 16 juillet : 447 · 15 juillet : 428 · Écart : +19",
    "Indicateur : Impressions · 16 juillet : 15 820 · 15 juillet : 15 240 · Écart : +580",
  ]);
  assert.equal(
    plan.executiveSummary,
    "Le trafic organique progresse sans baisse des conversions. 447 clics le 16 juillet",
  );
});

test("rend aussi un tableau Markdown autonome lisible dans le PDF", () => {
  const plan = buildDocumentPlanFromAgent({
    prompt: "Génère le tableau en PDF",
    answer: [
      "| Canal | Résultat |",
      "|---|---|",
      "| Google Search | 58 K€ de pipeline |",
    ].join("\n"),
    sources: ["GADS-2026-07"],
  });

  assert.equal(plan.sections[0]?.title, "Comparatif");
  assert.deepEqual(plan.sections[0]?.bullets, [
    "Canal : Google Search · Résultat : 58 K€ de pipeline",
  ]);
});
