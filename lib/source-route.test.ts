import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GET } from "@/app/api/sources/[id]/route";

async function fixtureVault() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "ops-source-route-"));
  const root = path.join(parent, "OPS — Atelier Beaumarchais");
  await fs.mkdir(path.join(root, "Finance"), { recursive: true });
  await fs.mkdir(path.join(root, "Projets"), { recursive: true });
  await fs.writeFile(
    path.join(root, "Finance", "FIN-001 — Situation.md"),
    `---
id: FIN-001
type: snapshot
title: "Situation financière"
updated_at: 2026-07-17T08:00:00+02:00
source: OPS Demo Seed
margin: 29
local_path: "${root}/secret/source.json"
---

# Situation financière

La marge moyenne atteint 29 %. Le fichier source reste dans ${root}/secret/source.json.

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
updated_at: 2026-07-17T07:00:00+02:00
source: Planning
---

# Chantier Rivoli

Le chantier explique l'écart de marge.

## Relations

- [[FIN-001 — Situation financière]]
`,
    "utf8",
  );
  return { parent, root };
}

function call(id: string) {
  return GET(
    new Request(`http://localhost/api/sources/${encodeURIComponent(id)}`),
    { params: Promise.resolve({ id }) },
  );
}

test("retourne une source exacte, ses attributs sûrs et ses relations résolues", async (t) => {
  const { parent, root } = await fixtureVault();
  const previous = process.env.OBSIDIAN_VAULT_PATH;
  process.env.OBSIDIAN_VAULT_PATH = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = previous;
    await fs.rm(parent, { recursive: true, force: true });
  });

  const response = await call("FIN-001");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const payload = await response.json() as {
    id: string;
    title: string;
    type: string;
    facts: string[];
    path: string;
    attributes: Record<string, unknown>;
    content: string;
    source: string | null;
    related: Array<{ id: string; relation: string; path: string }>;
  };
  assert.equal(payload.id, "FIN-001");
  assert.equal(payload.title, "Situation financière");
  assert.equal(payload.type, "snapshot");
  assert.equal(payload.source, "Mémoire OPS");
  assert.doesNotMatch(JSON.stringify(payload), /d[ée]mo|démonstration|ficti/i);
  assert.ok(payload.facts.some((fact) => fact.includes("24,3 K€")));
  assert.equal(payload.path, "Finance/FIN-001 — Situation.md");
  assert.equal(payload.attributes.margin, 29);
  assert.equal(payload.attributes.local_path, undefined);
  assert.doesNotMatch(JSON.stringify(payload), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(payload.content, /\[mémoire OPS\]/);
  assert.deepEqual(
    payload.related.map(({ id, relation }) => ({ id, relation })),
    [{ id: "PROJET-241", relation: "bidirectional" }],
  );
  assert.equal(payload.related[0]?.path, "Projets/PROJET-241 — Chantier Rivoli.md");
});

test("accepte un identifiant encodé et un fallback de titre uniquement s'il est non ambigu", async (t) => {
  const { parent, root } = await fixtureVault();
  const previous = process.env.OBSIDIAN_VAULT_PATH;
  process.env.OBSIDIAN_VAULT_PATH = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = previous;
    await fs.rm(parent, { recursive: true, force: true });
  });

  const encoded = await call("Situation%20financi%C3%A8re");
  assert.equal(encoded.status, 200);
  assert.equal((await encoded.json()).id, "FIN-001");

  await fs.writeFile(
    path.join(root, "Finance", "FIN-002 — Copie.md"),
    `---\nid: FIN-002\ntype: snapshot\ntitle: "Situation financière"\n---\n\n# Copie\n`,
    "utf8",
  );
  const ambiguous = await call("Situation financière");
  assert.equal(ambiguous.status, 404);
  assert.equal((await ambiguous.json()).error, "source_not_found");
});

test("rejette les identifiants invalides et retourne un 404 sobre", async (t) => {
  const { parent, root } = await fixtureVault();
  const previous = process.env.OBSIDIAN_VAULT_PATH;
  process.env.OBSIDIAN_VAULT_PATH = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = previous;
    await fs.rm(parent, { recursive: true, force: true });
  });

  for (const id of ["../FIN-001", "%E0%A4%A", "file:%2F%2Fetc%2Fpasswd", "x".repeat(181)]) {
    const response = await call(id);
    assert.equal(response.status, 400, id);
    assert.equal((await response.json()).error, "invalid_source_id");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }

  const missing = await call("UNKNOWN-999");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "source_not_found" });
  assert.match(missing.headers.get("cache-control") ?? "", /no-store/);
});
