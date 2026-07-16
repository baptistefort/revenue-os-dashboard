import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/agent/route.ts", import.meta.url);
const engineUrl = new URL("./ops-agent-engine.ts", import.meta.url);

test("la route agent ne contient plus de moteur métier de secours", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.doesNotMatch(source, /\bdeterministicResponse\b/);
  assert.doesNotMatch(source, /deterministic-recovery/);
  assert.doesNotMatch(source, /\bnew OpenAI\b/);
  assert.doesNotMatch(source, /companyContext/);
  assert.match(source, /unavailableResponse/);
  assert.match(source, /buildOpenCodeMessage\(message, history\)/);
  assert.match(source, /document: z\.null\(\)/);
  assert.match(source, /document: openCodeDocumentSchema/);
  assert.match(source, /if \(document\)[\s\S]*document/);
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
