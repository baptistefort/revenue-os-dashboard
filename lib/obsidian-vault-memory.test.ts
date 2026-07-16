import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildObsidianVaultIndex,
  extractWikiLinks,
  findObsidianMemoryRecord,
  getRelatedObsidianMemory,
  parseObsidianMarkdown,
  resolveSafeObsidianNote,
  searchObsidianMemory,
} from "./obsidian-vault-memory";

async function fixtureVault() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ops-obsidian-"));
  await fs.mkdir(path.join(root, "Finance"), { recursive: true });
  await fs.mkdir(path.join(root, "Projets"), { recursive: true });
  await fs.writeFile(
    path.join(root, "Finance", "FIN-001 — Situation.md"),
    `---
id: FIN-001
type: snapshot
title: "Situation financière"
aliases:
  - cash
  - trésorerie
updated_at: 2026-07-16T08:00:00+02:00
source: ERP
margin: 29
---

# Situation financière

La marge moyenne atteint 29 % et la trésorerie couvre 67 jours.

## Faits

- Créances à traiter : 24,3 K€.

## Relations

- [[PROJET-241 — Chantier Rivoli]]
`,
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "Projets", "PROJET-241 — Chantier Rivoli.md"),
    `---
id: PROJET-241
type: project
title: "Chantier Rivoli"
updated_at: 2026-07-16T07:00:00+02:00
---

# Chantier Rivoli

Le chantier explique l'écart de marge.

## Relations

- [[FIN-001 — Situation financière]]
`,
    "utf8",
  );
  return root;
}

test("parses simple Obsidian frontmatter, lists and body", () => {
  const parsed = parseObsidianMarkdown(`---
id: NOTE-1
aliases:
  - alpha
  - beta
amount: 42.5
active: true
---

# Note
`);
  assert.equal(parsed.frontmatter.id, "NOTE-1");
  assert.deepEqual(parsed.frontmatter.aliases, ["alpha", "beta"]);
  assert.equal(parsed.frontmatter.amount, 42.5);
  assert.equal(parsed.frontmatter.active, true);
  assert.match(parsed.body, /# Note/);
});

test("extracts unique Obsidian wikilinks without anchors or labels", () => {
  assert.deepEqual(
    extractWikiLinks("[[NOTE-1 — Titre|libellé]] [[NOTE-2#Section]] [[NOTE-1 — Titre]]"),
    ["NOTE-1 — Titre", "NOTE-2"],
  );
});

test("indexes, searches and resolves the real markdown records", async (t) => {
  const root = await fixtureVault();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const index = await buildObsidianVaultIndex(root);

  assert.equal(index.records.length, 2);
  const finance = findObsidianMemoryRecord(index, "FIN-001");
  assert.ok(finance);
  assert.equal(finance.title, "Situation financière");
  assert.equal(finance.attributes.margin, 29);
  assert.match(finance.summary, /29 %/);
  assert.ok(finance.facts.some((fact) => fact.includes("24,3 K€")));

  const matches = searchObsidianMemory(index, "trésorerie 67 jours", 5);
  assert.equal(matches[0]?.record.id, "FIN-001");
  assert.ok(matches[0]?.score > 0);
});

test("follows real outgoing links and backlinks", async (t) => {
  const root = await fixtureVault();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const index = await buildObsidianVaultIndex(root);
  const finance = findObsidianMemoryRecord(index, "FIN-001");
  assert.ok(finance);

  const related = getRelatedObsidianMemory(index, finance, 10);
  assert.equal(related.length, 1);
  assert.equal(related[0].record.id, "PROJET-241");
  assert.equal(related[0].relation, "bidirectional");
});

test("safe note resolution rejects traversal and accepts an indexed markdown path", async (t) => {
  const root = await fixtureVault();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  assert.equal(await resolveSafeObsidianNote(root, "../outside.md"), null);
  assert.equal(await resolveSafeObsidianNote(root, "/etc/passwd"), null);
  const note = await resolveSafeObsidianNote(root, "Finance/FIN-001 — Situation.md");
  assert.equal(note?.relativePath, "Finance/FIN-001 — Situation.md");
});
