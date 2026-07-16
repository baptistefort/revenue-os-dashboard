import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentUnavailableScenario,
  buildOpenCodeMessage,
  compactConversationHistory,
  conversationIdentitySeed,
  asksForDocumentOutput,
  needsCompanyResearch,
} from "@/lib/ops-agent-engine";
import type { AgentHistoryTurn } from "@/lib/ops-memory";

test("seuls les tours sociaux autonomes évitent la recherche métier", () => {
  for (const prompt of [
    "salut",
    "ça va ?",
    "merci beaucoup",
    "je t’ai pas demandé si tu allais bien",
  ]) {
    assert.equal(needsCompanyResearch(prompt), false, prompt);
  }

  for (const prompt of [
    "Explique VAL-061",
    "Et pour Nova ?",
    "Continue",
    "merci, détaille maintenant la marge",
    "tu n’as pas compris, explique VAL-061",
  ]) {
    assert.equal(needsCompanyResearch(prompt), true, prompt);
  }
});

test("le plan document n'est demandé que pour une production explicite", () => {
  for (const prompt of [
    "Génère ce brief en PDF",
    "Exporte le rapport",
    "Transforme cette analyse en document",
    "Fais-en un PDF",
  ]) {
    assert.equal(asksForDocumentOutput(prompt), true, prompt);
  }

  for (const prompt of [
    "Résume ce rapport",
    "Que contient ce PDF ?",
    "Prépare mon brief CODIR",
    "Analyse le document existant",
    "Crée les missions du rapport",
    "Prépare l’email d’accompagnement du rapport",
  ]) {
    assert.equal(asksForDocumentOutput(prompt), false, prompt);
  }
});

test("le transcript UI est réinjecté comme contexte autoritatif à chaque tour", () => {
  const history: AgentHistoryTurn[] = [
    { role: "user", content: "Prépare mon brief CODIR" },
    {
      role: "assistant",
      content: "Le brief porte sur la marge et le cash [FIN-SNAPSHOT-20260715].",
    },
    {
      role: "assistant",
      content: "Document produit : Brief CODIR.pdf (RAPPORT-42, 4 pages, disponible dans Documents).",
    },
  ];

  const prompt = buildOpenCodeMessage("Résume ce document", history);
  assert.match(prompt, /CONTEXTE CONVERSATIONNEL AUTORITATIF/);
  assert.match(prompt, /Brief CODIR\.pdf/);
  assert.match(prompt, /RAPPORT-42/);
  assert.match(prompt, /DEMANDE ACTUELLE DE MARIE\s+Résume ce document/);
});

test("sans historique, le message OpenCode reste direct", () => {
  assert.equal(buildOpenCodeMessage("Bonjour", []), "Bonjour");
});

test("la compaction serveur conserve uniquement les douze derniers tours", () => {
  const history: AgentHistoryTurn[] = Array.from({ length: 15 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `tour-${index} ${"x".repeat(2_000)}`,
  }));
  const compacted = compactConversationHistory(history);

  assert.doesNotMatch(compacted, /tour-0\b/);
  assert.doesNotMatch(compacted, /tour-2\b/);
  assert.match(compacted, /tour-3\b/);
  assert.match(compacted, /tour-14\b/);
  assert.ok(compacted.split("\n").every((line) => line.length <= 1_800));
});

test("l'identité de conversation survit au digest long de l'interface", () => {
  const longInitialQuestion = `Question initiale ${"très longue ".repeat(80)}`;
  const initial = conversationIdentitySeed(longInitialQuestion, []);
  const restored = conversationIdentitySeed("Question de suivi", [
    {
      role: "assistant",
      content: `CONTEXTE STRUCTURÉ DES ÉCHANGES ANTÉRIEURS\n1. Marie — ${longInitialQuestion.slice(0, 460)}\n2. OPS — Réponse`,
    },
    { role: "user", content: "Question récente" },
  ]);

  assert.equal(restored, initial);
});

test("le fallback local est strictement technique et sans réponse métier", () => {
  const scenario = buildAgentUnavailableScenario("Explique VAL-061");
  const rendered = JSON.stringify({
    lead: scenario.lead,
    body: scenario.body,
    sources: scenario.sources,
    followups: scenario.followups,
  });

  assert.equal(scenario.id, "agent-unavailable");
  assert.deepEqual(scenario.sources, []);
  assert.doesNotMatch(rendered, /\b(?:VAL|FACT|PROJET|CRM|MIS)-\d+/);
  assert.doesNotMatch(rendered, /\b(?:marge|pipeline|créance|Nova|Rivoli)\b/i);
});
