import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/agent/route.ts", import.meta.url);
const engineUrl = new URL("./ops-agent-engine.ts", import.meta.url);
const adapterUrl = new URL("./opencode-adapter.ts", import.meta.url);

function methodSource(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `marqueur de début introuvable : ${startMarker}`);
  assert.notEqual(end, -1, `marqueur de fin introuvable : ${endMarker}`);
  return source.slice(start, end);
}

test("la route agent ne contient plus de moteur métier de secours", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.doesNotMatch(source, /\bdeterministicResponse\b/);
  assert.doesNotMatch(source, /deterministic-recovery/);
  assert.doesNotMatch(source, /\bnew OpenAI\b/);
  assert.doesNotMatch(source, /companyContext/);
  assert.match(source, /unavailableResponse/);
  assert.match(source, /buildOpenCodeMessage\(message, history\)/);
  assert.match(source, /document: z\.null\(\)/);
  assert.match(source, /schema: openCodeOutputSchema/);
  assert.match(source, /buildDocumentPlanFromAgent/);
  assert.match(source, /const document = await verifiedDocument/);
  assert.match(source, /recoverableStreamedOpenCodeAnswer/);
  assert.match(source, /mode: "opencode-recovered"/);
  assert.match(source, /actions: \[\]/);
  assert.match(source, /shouldRetryBusyOpenCodeTurn/);
  assert.match(source, /if \(document\)[\s\S]*mode: "opencode", document/);
  assert.match(source, /Pour une position moyenne SEO, un nombre qui baisse est une amélioration/);
  assert.doesNotMatch(source, /openCodeDocumentOutputSchema/);
});

test("l'engine ne contient plus les décisions métier préfabriquées historiques", async () => {
  const source = await readFile(engineUrl, "utf8");

  for (const forbidden of [
    "VAL-061 autorise",
    "Brief CODIR — trois décisions",
    "MIS-032",
    "Scénario central : 216 K€",
    "L’entreprise vend correctement",
    "J’ai trouvé ${retrieved.length}",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("la finalisation OpenCode directe demande un JSON texte sans format json_schema natif", async () => {
  const source = await readFile(adapterUrl, "utf8");
  const runStructured = methodSource(
    source,
    "  async runStructured<TSchema extends z.ZodType>(",
    "\n}\n\nexport function createOpenCodeAdapter",
  );

  assert.doesNotMatch(runStructured, /type:\s*["']json_schema["']/);
  assert.match(runStructured, /format:\s*\{\s*type:\s*["']text["']\s*\}/);

  const directBranchStart = runStructured.indexOf("const finalRequest = !usesTools");
  assert.notEqual(directBranchStart, -1, "branche de finalisation directe introuvable");
  const directPromptStart = runStructured.indexOf("`", directBranchStart);
  const directPromptEnd = runStructured.indexOf("`", directPromptStart + 1);
  assert.notEqual(directPromptStart, -1, "prompt direct introuvable");
  assert.notEqual(directPromptEnd, -1, "fin du prompt direct introuvable");
  const directPrompt = runStructured.slice(directPromptStart + 1, directPromptEnd);

  assert.match(directPrompt, /Retourne uniquement un objet JSON valide/i);
  assert.match(directPrompt, /\$\{JSON\.stringify\(outputSchema\)\}/);
});
