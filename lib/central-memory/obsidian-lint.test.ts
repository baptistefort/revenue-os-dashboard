import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { SqlQueryable } from "./database";
import { projectCentralMemoryToObsidian } from "./obsidian-projection";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "../..");
const seedScript = path.join(projectRoot, "scripts/seed-obsidian.mjs");

const organization = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "atelier-beaumarchais",
  display_name: "Atelier Beaumarchais",
};

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: [],
  };
}

function projectionQueryable(): SqlQueryable {
  const entities = [
    {
      id: "00000000-0000-4000-8000-000000000010",
      canonical_key: "ORG-001",
      entity_type: "organization",
      display_name: "Atelier Beaumarchais",
      summary: "Mémoire centrale de l'entreprise.",
      attributes: { city: "Paris", confidentiality: "interne" },
      confidence: 1,
      status: "active",
      first_seen_at: "2026-07-01T08:00:00Z",
      last_seen_at: "2026-07-17T08:00:00Z",
      source_type: "central-memory",
      source_id: "ORG-001",
      source_version: 1,
      source_updated_at: "2026-07-17T08:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000011",
      canonical_key: "CLIENT-001",
      entity_type: "client",
      display_name: "Vitreflam",
      summary: "Client industriel prioritaire.",
      attributes: { city: "Lyon", confidentiality: "confidentiel" },
      confidence: 0.95,
      status: "active",
      first_seen_at: "2026-07-01T08:00:00Z",
      last_seen_at: "2026-07-17T09:00:00Z",
      source_type: "twenty",
      source_id: "account-vitreflam",
      source_version: 7,
      source_updated_at: "2026-07-17T09:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      canonical_key: "CONTACT-001",
      entity_type: "contact",
      display_name: "Fabien Martin",
      summary: "Directeur général chez Vitreflam.",
      attributes: { role: "Directeur général" },
      confidence: 0.9,
      status: "active",
      first_seen_at: "2026-07-01T08:00:00Z",
      last_seen_at: "2026-07-17T09:00:00Z",
      source_type: "gmail",
      source_id: "contact-fabien",
      source_version: 2,
      source_updated_at: "2026-07-17T09:00:00Z",
    },
  ];
  const relations = [{
    id: "00000000-0000-4000-8000-000000000101",
    subject_id: entities[2].id,
    subject_key: entities[2].canonical_key,
    subject_name: entities[2].display_name,
    predicate: "works_for",
    object_id: entities[1].id,
    object_key: entities[1].canonical_key,
    object_name: entities[1].display_name,
    confidence: 1,
    properties: {},
    observed_at: "2026-07-17T09:00:00Z",
  }];

  return {
    query: async <Row extends QueryResultRow>(sql: string) => {
      if (sql.includes("FROM ops_memory.organizations")) {
        return queryResult([organization] as unknown as Row[]);
      }
      if (sql.includes("FROM ops_memory.relations")) {
        return queryResult(relations as unknown as Row[]);
      }
      if (sql.includes("FROM ops_memory.entities")) {
        return queryResult(entities as unknown as Row[]);
      }
      throw new Error(`Unexpected projection query: ${sql}`);
    },
  };
}

async function lint(vault: string) {
  const result = await execFileAsync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "run",
    "memory:lint",
    "--silent",
  ], {
    cwd: projectRoot,
    env: { ...process.env, OBSIDIAN_VAULT_PATH: vault },
  });
  return JSON.parse(result.stdout) as {
    healthy: boolean;
    notes: number;
    roots: string[];
    brokenLinks: unknown[];
    missingFrontmatter: unknown[];
    orphans: unknown[];
  };
}

test("lint accepts projector frontmatter and vault-relative Central wikilinks in every supported layout", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-obsidian-lint-"));
  try {
    await projectCentralMemoryToObsidian({
      vaultRoot: vault,
      queryable: projectionQueryable(),
      organizationSlug: organization.slug,
    });

    const projectedFromVault = await lint(vault);
    assert.equal(projectedFromVault.healthy, true);
    assert.equal(projectedFromVault.notes, 3);
    assert.deepEqual(projectedFromVault.brokenLinks, []);
    assert.deepEqual(projectedFromVault.missingFrontmatter, []);
    assert.deepEqual(projectedFromVault.orphans, []);

    const projectedFromCentral = await lint(path.join(vault, "Central"));
    assert.equal(projectedFromCentral.healthy, true);
    assert.equal(projectedFromCentral.notes, 3);

    await execFileAsync(process.execPath, [seedScript], {
      cwd: projectRoot,
      env: { ...process.env, OBSIDIAN_VAULT_PATH: vault },
    });
    const seededRoot = path.join(vault, "OPS — Atelier Beaumarchais");

    const seededDirectly = await lint(seededRoot);
    assert.equal(seededDirectly.healthy, true);
    assert.ok(seededDirectly.notes > projectedFromVault.notes);

    const combined = await lint(vault);
    assert.equal(combined.healthy, true);
    assert.equal(combined.notes, seededDirectly.notes + projectedFromVault.notes);
    assert.deepEqual(combined.roots, [seededRoot, path.join(vault, "Central")]);
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
  }
});
