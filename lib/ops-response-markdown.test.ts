import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOpsInline,
  parseOpsResponseMarkdown,
  plainTextFromOpsMarkdown,
} from "@/lib/ops-response-markdown";

test("parses short headings, bullets and inline emphasis without raw HTML", () => {
  const blocks = parseOpsResponseMarkdown(`### L’essentiel

La marge passe à **29 %** [FIN-SNAPSHOT-20260716].

- Sécuriser Rivoli
- Relancer Nova`);

  assert.deepEqual(blocks.map((block) => block.kind), ["heading", "paragraph", "list"]);
  assert.equal(blocks[0].kind === "heading" && blocks[0].level, 4);
  assert.deepEqual(parseOpsInline("**29 %** [FIN-001]").map(({ kind }) => kind), ["strong", "text", "citation"]);
});

test("parses compact comparison tables", () => {
  const blocks = parseOpsResponseMarkdown(`| Indicateur | Hier | Aujourd’hui | Écart |
|---|---:|---:|---:|
| Clics | 428 | 447 | **+19** |
| Position | 13,8 | 13,4 | **-0,4** |`);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "table");
  if (blocks[0].kind === "table") {
    assert.equal(blocks[0].headers.length, 4);
    assert.equal(blocks[0].rows.length, 2);
  }
});

test("builds speech-safe plain text from the presentation markdown", () => {
  const text = plainTextFromOpsMarkdown(`### Décision

- Valider **Rivoli** [VAL-063]

| Action | Montant |
|---|---:|
| Avenant | 6,8 K€ |`);

  assert.doesNotMatch(text, /[#*|`]/);
  assert.doesNotMatch(text, /VAL-063/);
  assert.match(text, /Valider Rivoli/);
  assert.match(text, /Avenant, 6,8 K€/);
});
