import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackScenario,
  extractPdfTopic,
  resolvePdfRequest,
} from "@/lib/ops-agent-engine";
import type { AgentHistoryTurn } from "@/lib/ops-memory";

const marginSources = ["PROJET-241", "TEMPS-086", "ACHAT-109", "FACT-882", "ALERT-201"];

function marginConversation(): AgentHistoryTurn[] {
  const prompt = "Pourquoi la marge atelier baisse ?";
  const answer = buildFallbackScenario(prompt);
  return [
    { role: "user", content: prompt },
    // Reproduit l'historique réellement envoyé par l'interface : le corps
    // affiché, sans dépendre des puces de sources de l'UI.
    { role: "assistant", content: answer.body.join("\n\n") },
  ];
}

test("la baisse de marge est reliée aux cinq preuves attendues", () => {
  const scenario = buildFallbackScenario("Pourquoi la marge atelier baisse ?");
  assert.equal(scenario.id, "marge");
  assert.deepEqual(scenario.sources, marginSources);
});

test("un PDF explicatif hérite du diagnostic de marge précédent", () => {
  const history = marginConversation();
  const request = resolvePdfRequest("fait moi un pdf exaplicatif stp", history);
  const scenario = buildFallbackScenario("fait moi un pdf exaplicatif stp", history);

  assert.equal(request.needsClarification, false);
  assert.equal(request.contextId, "PROJET-241");
  assert.equal(request.title, "Rapport explicatif — baisse de marge atelier");
  assert.deepEqual(request.sourceIds, marginSources);
  assert.equal(scenario.id, "pdf-generation");
  assert.deepEqual(scenario.sources, marginSources);
  assert.equal(extractPdfTopic("fait moi un pdf exaplicatif stp", history), request.title);
});

test("un PDF explicatif sans conversation demande le sujet au lieu d'inventer", () => {
  const scenario = buildFallbackScenario("fais-moi un pdf explicatif stp");
  assert.equal(scenario.id, "pdf-clarification");
  assert.equal(extractPdfTopic("fais-moi un pdf explicatif stp"), null);
});

test("les salutations simples restent sociales et sans sources", () => {
  for (const prompt of ["salut", "ça va ?", "tu vas bien ?", "salut est-ce que tu vas bien ?", "hello comment tu vas ?"]) {
    const scenario = buildFallbackScenario(prompt, marginConversation());
    assert.equal(scenario.id, "greeting", prompt);
    assert.deepEqual(scenario.sources, [], prompt);
  }
});

test("une correction après la salutation reste conversationnelle", () => {
  const greeting = buildFallbackScenario("hello");
  const history: AgentHistoryTurn[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: [greeting.lead, ...greeting.body].join("\n\n") },
  ];

  for (const prompt of [
    "je t’ai pas demandé si tu allais bien",
    "je ne t'ai pas demandé comment tu allais",
  ]) {
    const scenario = buildFallbackScenario(prompt, history);
    assert.equal(scenario.id, "conversation-repair", prompt);
    assert.deepEqual(scenario.sources, [], prompt);
    assert.match(scenario.lead, /Vous avez raison/);
  }
});

test("une correction métier n'est pas confondue avec la réparation de salutation", () => {
  const scenario = buildFallbackScenario("je ne t'ai pas demandé le rapport PDF");
  assert.notEqual(scenario.id, "conversation-repair");
});

test("les suivis implicites restent dans le dossier Rivoli", () => {
  const history = marginConversation();
  const hours = buildFallbackScenario("montre les heures non facturées", history);
  const purchases = buildFallbackScenario("et les achats ?", history);

  assert.equal(hours.sources[0], "TEMPS-086");
  assert.equal(purchases.sources[0], "ACHAT-109");
});
