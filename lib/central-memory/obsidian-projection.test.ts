import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { SqlQueryable } from "./database";
import {
  projectCentralMemoryRecordToObsidian,
  projectCentralMemoryToObsidian,
} from "./obsidian-projection";

const organization = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "atelier-beaumarchais",
  display_name: "Atelier Beaumarchais",
};

function entity(overrides: Record<string, unknown>) {
  return {
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
    source_type: null,
    source_id: null,
    source_version: null,
    source_updated_at: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}

function relation(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    subject_id: "00000000-0000-4000-8000-000000000012",
    subject_key: "CONTACT-001",
    subject_name: "Fabien Martin",
    predicate: "works_for",
    object_id: "00000000-0000-4000-8000-000000000011",
    object_key: "CLIENT-001",
    object_name: "Vitreflam",
    confidence: 1,
    properties: {},
    observed_at: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: [],
  };
}

function fakeQueryable(state: {
  entities: Array<ReturnType<typeof entity>>;
  relations: Array<ReturnType<typeof relation>>;
}) {
  const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const queryable: SqlQueryable = {
    query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM ops_memory.organizations")) {
        assert.deepEqual(values, [organization.slug]);
        return queryResult([organization] as unknown as Row[]);
      }
      assert.equal(values?.[0], organization.id, "every projection query must be tenant scoped");
      if (sql.includes("lower(entities.canonical_key) = lower($2)")) {
        const recordKey = String(values?.[1] ?? "").toLocaleLowerCase("en");
        return queryResult(state.entities.filter((item) => (
          item.canonical_key.toLocaleLowerCase("en") === recordKey
          || String((item.attributes as Record<string, unknown>)?.central_record_id ?? "").toLocaleLowerCase("en") === recordKey
          || String(item.source_id ?? "").toLocaleLowerCase("en") === recordKey
        )).slice(0, 1) as unknown as Row[]);
      }
      if (sql.includes("entities.id = ANY($2::uuid[])")) {
        const selected = new Set((values?.[1] ?? []) as string[]);
        return queryResult(state.entities.filter((item) => selected.has(item.id)) as unknown as Row[]);
      }
      if (sql.includes("relations.subject_entity_id = $2 OR relations.object_entity_id = $2")) {
        const entityId = String(values?.[1] ?? "");
        return queryResult(state.relations.filter((item) => (
          item.subject_id === entityId || item.object_id === entityId
        )) as unknown as Row[]);
      }
      if (sql.includes("FROM ops_memory.entities") && !sql.includes("FROM ops_memory.relations")) {
        return queryResult(state.entities as unknown as Row[]);
      }
      if (sql.includes("FROM ops_memory.relations")) {
        const selected = new Set((values?.[1] ?? []) as string[]);
        return queryResult(state.relations.filter((item) => (
          selected.has(item.subject_id) && selected.has(item.object_id)
        )) as unknown as Row[]);
      }
      throw new Error(`Unexpected SQL in fake projection database: ${sql}`);
    },
  };
  return { queryable, calls };
}

test("projects one durable note per entity with provenance and Obsidian links", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-projection-"));
  try {
    const state = {
      entities: [
        entity({}),
        entity({
          id: "00000000-0000-4000-8000-000000000011",
          canonical_key: "CLIENT-001",
          entity_type: "client",
          display_name: "Vitreflam",
          summary: "Client industriel prioritaire.",
          attributes: {
            city: "Lyon",
            segment: "industrie",
            confidentiality: "confidentiel",
            apiKey: "must-never-be-projected",
          },
          source_type: "twenty",
          source_id: "account-vitreflam",
          source_version: 7,
          source_updated_at: "2026-07-17T09:10:00Z",
        }),
        entity({
          id: "00000000-0000-4000-8000-000000000012",
          canonical_key: "CONTACT-001",
          entity_type: "contact",
          display_name: "Fabien Martin",
          summary: "Directeur général chez Vitreflam.",
          attributes: { role: "Directeur général", email: "fabien@vitreflam.fr" },
          source_type: "gmail",
          source_id: "contact-fabien",
          source_version: 2,
        }),
        entity({
          id: "00000000-0000-4000-8000-000000000013",
          canonical_key: "EMAIL-RAW-001",
          entity_type: "email-message",
          display_name: "Message brut Gmail",
          summary: "Ce message reste dans la mémoire brute.",
        }),
      ],
      relations: [relation()],
    };
    const { queryable } = fakeQueryable(state);
    await fs.writeFile(path.join(vault, "Note manuelle.md"), "Ne jamais supprimer.\n", "utf8");
    await fs.mkdir(path.join(vault, "Central"), { recursive: true });
    await fs.writeFile(path.join(vault, "Central", "Note manuelle centrale.md"), "Préserver aussi.\n", "utf8");

    const first = await projectCentralMemoryToObsidian({ vaultRoot: vault, queryable });
    assert.equal(first.entities, 3);
    assert.equal(first.excludedTransientEntities, 1);
    assert.equal(first.created.length, 3);
    assert.equal(first.relations, 1);

    const clientFile = first.created.find((file) => file.startsWith("Clients/"));
    const contactFile = first.created.find((file) => file.startsWith("Personnes/"));
    assert.ok(clientFile);
    assert.ok(contactFile);
    const clientNote = await fs.readFile(path.join(vault, "Central", clientFile), "utf8");
    const contactNote = await fs.readFile(path.join(vault, "Central", contactFile), "utf8");
    assert.match(clientNote, /canonical_key: "CLIENT-001"/);
    assert.match(clientNote, /source_type\\?":\\?"twenty|source_type":"twenty"/);
    assert.match(clientNote, /confidentiality: "confidentiel"/);
    assert.doesNotMatch(clientNote, /must-never-be-projected|apiKey/);
    assert.match(clientNote, /\[\[Central\/Personnes\/[^\]]+\|Fabien Martin\]\]/);
    assert.match(contactNote, /`works_for`/);
    assert.equal(first.created.some((file) => /email-raw|message-brut/i.test(file)), false);

    const second = await projectCentralMemoryToObsidian({ vaultRoot: vault, queryable });
    assert.equal(second.created.length, 0);
    assert.equal(second.updated.length, 0);
    assert.equal(second.deleted.length, 0);
    assert.equal(second.unchanged.length, first.created.length);
    assert.equal(await fs.readFile(path.join(vault, "Note manuelle.md"), "utf8"), "Ne jamais supprimer.\n");
    assert.equal(
      await fs.readFile(path.join(vault, "Central", "Note manuelle centrale.md"), "utf8"),
      "Préserver aussi.\n",
    );
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
  }
});

test("incremental projection updates changed notes and only removes manifest-managed files", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-incremental-"));
  try {
    const state = {
      entities: [
        entity({}),
        entity({
          id: "00000000-0000-4000-8000-000000000011",
          canonical_key: "CLIENT-001",
          entity_type: "client",
          display_name: "Vitreflam",
          summary: "Version initiale.",
        }),
        entity({
          id: "00000000-0000-4000-8000-000000000012",
          canonical_key: "CONTACT-001",
          entity_type: "contact",
          display_name: "Fabien Martin",
        }),
      ],
      relations: [relation()],
    };
    const { queryable } = fakeQueryable(state);
    const first = await projectCentralMemoryToObsidian({ vaultRoot: vault, queryable });
    const contactFile = first.created.find((file) => file.startsWith("Personnes/"));
    assert.ok(contactFile);
    const manual = path.join(vault, "Central", "Personnes", "Connaissance manuelle.md");
    await fs.writeFile(manual, "Cette note appartient à l'utilisateur.\n", "utf8");
    const manifestPath = path.join(vault, "Central", ".ops-central-memory-manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { files: string[] };
    manifest.files.push("Personnes/Connaissance manuelle.md");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    state.entities = state.entities
      .filter((item) => item.id !== "00000000-0000-4000-8000-000000000012")
      .map((item) => item.canonical_key === "CLIENT-001"
        ? { ...item, summary: "Version enrichie depuis le CRM.", last_seen_at: "2026-07-17T10:00:00Z" }
        : item);
    const second = await projectCentralMemoryToObsidian({ vaultRoot: vault, queryable });
    assert.deepEqual(second.deleted, [contactFile]);
    assert.ok(second.updated.some((file) => file.startsWith("Clients/")));
    assert.equal(await fs.readFile(manual, "utf8"), "Cette note appartient à l'utilisateur.\n");
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
  }
});

test("a hot UI mutation projects only its entity and preserves the full Central manifest", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-hot-record-"));
  try {
    const opportunityId = "00000000-0000-4000-8000-000000000020";
    const state = {
      entities: [
        entity({}),
        entity({
          id: "00000000-0000-4000-8000-000000000011",
          canonical_key: "CLIENT-001",
          entity_type: "client",
          display_name: "Vitreflam",
        }),
      ],
      relations: [] as Array<ReturnType<typeof relation>>,
    };
    const { queryable, calls } = fakeQueryable(state);
    const full = await projectCentralMemoryToObsidian({ vaultRoot: vault, queryable });
    assert.equal(full.created.length, 2);
    const previousFiles = JSON.parse(
      await fs.readFile(path.join(vault, "Central", ".ops-central-memory-manifest.json"), "utf8"),
    ) as { files: string[] };

    state.entities.push(entity({
      id: opportunityId,
      canonical_key: "opp-hot-001",
      entity_type: "opportunity",
      display_name: "Extension Vitreflam",
      summary: "Opportunité créée depuis le pipeline OPS.",
      attributes: { central_record_id: "OPP-HOT-001", amount: 48_000 },
      source_type: "ops_action",
      source_id: "OPP-HOT-001",
    }));
    state.relations.push(relation({
      id: "00000000-0000-4000-8000-000000000120",
      subject_id: "00000000-0000-4000-8000-000000000010",
      subject_key: "ORG-001",
      subject_name: "Atelier Beaumarchais",
      predicate: "contains",
      object_id: opportunityId,
      object_key: "opp-hot-001",
      object_name: "Extension Vitreflam",
    }));
    const callCountBeforeHotPath = calls.length;
    const projected = await projectCentralMemoryRecordToObsidian({
      vaultRoot: vault,
      queryable,
      recordKey: "OPP-HOT-001",
    });
    assert.equal(projected.created, true);
    assert.equal(projected.updated, false);
    assert.match(projected.relativePath, /^Opportunites\//);
    const hotCalls = calls.slice(callCountBeforeHotPath);
    assert.ok(hotCalls.some(({ sql }) => sql.includes("lower(entities.canonical_key) = lower($2)")));
    assert.ok(hotCalls.every(({ sql }) => !sql.includes("ORDER BY entities.entity_type, entities.canonical_key")));

    const manifest = JSON.parse(
      await fs.readFile(path.join(vault, "Central", ".ops-central-memory-manifest.json"), "utf8"),
    ) as { files: string[] };
    for (const file of previousFiles.files) assert.ok(manifest.files.includes(file));
    assert.ok(manifest.files.includes(projected.relativePath));
    const note = await fs.readFile(path.join(vault, "Central", projected.relativePath), "utf8");
    assert.match(note, /canonical_key: "opp-hot-001"/);
    assert.match(note, /`contains`/);
    assert.match(note, /\[\[Central\/Entreprise\//);

    const replay = await projectCentralMemoryRecordToObsidian({
      vaultRoot: vault,
      queryable,
      recordKey: "OPP-HOT-001",
    });
    assert.equal(replay.unchanged, true);
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
  }
});

test("a renamed hot entity replaces only its former managed file", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-hot-rename-"));
  try {
    const state = {
      entities: [entity({
        id: "00000000-0000-4000-8000-000000000030",
        canonical_key: "task-hot-001",
        entity_type: "task",
        display_name: "Préparer le rendez-vous",
        attributes: { central_record_id: "TASK-HOT-001" },
        source_type: "ops_action",
        source_id: "TASK-HOT-001",
      })],
      relations: [] as Array<ReturnType<typeof relation>>,
    };
    const { queryable } = fakeQueryable(state);
    const first = await projectCentralMemoryRecordToObsidian({
      vaultRoot: vault,
      queryable,
      recordKey: "TASK-HOT-001",
    });
    const manual = path.join(vault, "Central", "Taches", "Note manuelle.md");
    await fs.writeFile(manual, "Toujours préserver.\n", "utf8");
    state.entities[0] = { ...state.entities[0], display_name: "Préparer le rendez-vous Vitreflam" };
    const second = await projectCentralMemoryRecordToObsidian({
      vaultRoot: vault,
      queryable,
      recordKey: "TASK-HOT-001",
    });
    assert.equal(second.created, true);
    assert.deepEqual(second.deleted, [first.relativePath]);
    await assert.rejects(() => fs.access(path.join(vault, "Central", first.relativePath)));
    assert.equal(await fs.readFile(manual, "utf8"), "Toujours préserver.\n");
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
  }
});

test("a traversal path injected into the manifest can never delete outside Central", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-security-"));
  try {
    const state = { entities: [entity({})], relations: [] as Array<ReturnType<typeof relation>> };
    const { queryable } = fakeQueryable(state);
    await projectCentralMemoryToObsidian({ vaultRoot: vault, queryable });
    const protectedFile = path.join(vault, "protected.md");
    await fs.writeFile(protectedFile, "protected\n", "utf8");
    const manifestPath = path.join(vault, "Central", ".ops-central-memory-manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { files: string[] };
    manifest.files.push("../protected.md");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

    await assert.rejects(
      () => projectCentralMemoryToObsidian({ vaultRoot: vault, queryable }),
      /Unsafe managed projection path/,
    );
    assert.equal(await fs.readFile(protectedFile, "utf8"), "protected\n");
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
  }
});

test("refuses a symlinked Central directory that could escape the vault", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-symlink-vault-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-symlink-outside-"));
  try {
    await fs.symlink(outside, path.join(vault, "Central"), "dir");
    const { queryable } = fakeQueryable({ entities: [entity({})], relations: [] });
    await assert.rejects(
      () => projectCentralMemoryToObsidian({ vaultRoot: vault, queryable }),
      /Unsafe managed projection directory/,
    );
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("never overwrites a manual note even if its path collides with a managed projection", async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "ops-central-collision-"));
  try {
    const state = { entities: [entity({})], relations: [] as Array<ReturnType<typeof relation>> };
    const { queryable } = fakeQueryable(state);
    const first = await projectCentralMemoryToObsidian({ vaultRoot: vault, queryable });
    assert.equal(first.created.length, 1);
    const generatedFile = path.join(vault, "Central", first.created[0]);
    await fs.writeFile(generatedFile, "# Note désormais gérée manuellement\n", "utf8");
    state.entities = [{ ...state.entities[0], summary: "Nouvelle donnée centrale." }];

    await assert.rejects(
      () => projectCentralMemoryToObsidian({ vaultRoot: vault, queryable }),
      /Refusing to overwrite an unmanaged Obsidian note/,
    );
    assert.equal(await fs.readFile(generatedFile, "utf8"), "# Note désormais gérée manuellement\n");
  } finally {
    await fs.rm(vault, { recursive: true, force: true });
  }
});
