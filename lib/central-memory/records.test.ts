import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import {
  closeCentralMemoryPool,
  createCentralMemoryPool,
  type SqlQueryable,
} from "@/lib/central-memory/database";
import {
  mapCentralSourceObject,
  mergeCentralAndProjectedRecords,
  readCentralUiRecordById,
  readCentralUiRecords,
  type CentralUiRecord,
} from "@/lib/central-memory/records";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: [],
  };
}

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "gmail_000001",
    object_type: "email-message",
    title: "Budget validé",
    content_text: "Bonjour Marie, le budget est validé.",
    content_json: {
      id: "EMAIL-00001",
      kind: "email-message",
      clientId: "CLT-NOVA-HOTELS",
      threadId: "THR-0001",
      sender: "elodie.perrin@nova-hotels.example",
      recipients: ["marie@atelier-beaumarchais.fr"],
      sentAt: "2026-07-16T15:40:00.000Z",
      subject: "Budget validé",
      text: "Bonjour Marie, le budget est validé. Merci de préparer la version finale.",
      direction: "inbound",
      extractedIntent: "approval",
      requiresAction: true,
    },
    metadata: { externalId: "EMAIL-00001" },
    source_type: "gmail",
    source_created_at: "2026-07-16T15:40:00.000Z",
    source_updated_at: "2026-07-16T15:40:00.000Z",
    created_at: "2026-07-16T15:41:00.000Z",
    client_name: "Nova Hôtels",
    owner_name: null,
    project_name: null,
    sender_name: "Élodie Perrin",
    primary_contact_email: null,
    revenue_cents: null,
    margin_percent: null,
    last_interaction_at: null,
    next_opportunity: null,
    ...overrides,
  };
}

test("le lecteur central applique le tenant, les limites et le mapping email attendu par l'UI", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const queryable: SqlQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(
      sql: string,
      values: unknown[] = [],
    ): Promise<QueryResult<Row>> {
      calls.push({ sql, values });
      if (sql.includes("FROM ops_memory.organizations")) {
        return result([{ id: "org-nova" }] as unknown as Row[]);
      }
      return result([sourceRow()] as unknown as Row[]);
    },
  };

  const records = await readCentralUiRecords({
    kind: "email",
    organizationSlug: "atelier-nova",
    queryable,
  });

  assert.equal(calls[0].values[0], "atelier-nova");
  assert.equal(calls[1].values[0], "org-nova");
  assert.deepEqual(calls[1].values[1], ["email-message", "email", "email_draft"]);
  assert.equal(calls[1].values[2], 80);
  assert.equal(calls[1].values[3], "email");
  assert.match(calls[1].sql, /source\.organization_id = \$1/);
  assert.match(calls[1].sql, /source\.is_current = true/);

  assert.equal(records.length, 1);
  const email = records[0];
  assert.equal(email.id, "EMAIL-00001");
  assert.equal(email.title, "Budget validé");
  assert.equal(email.attributes.record_kind, "email");
  assert.equal(email.attributes.company, "Nova Hôtels");
  assert.equal(email.attributes.sender, "Élodie Perrin <elodie.perrin@nova-hotels.example>");
  assert.equal(email.attributes.sender_email, "elodie.perrin@nova-hotels.example");
  assert.equal(email.attributes.classification, "positive");
  assert.equal(email.attributes.status, "to_process");
  assert.equal(email.attributes.network_delivery, true);
  assert.deepEqual(email.relations, ["CLT-NOVA-HOTELS", "THR-0001"]);
  assert.match(email.content, /version finale/);
});

test("les opportunités fermées et tâches terminées sont exclues dans la requête centrale", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const queryable: SqlQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      return result((sql.includes("FROM ops_memory.organizations")
        ? [{ id: "org-1" }]
        : []) as unknown as Row[]);
    },
  };

  await readCentralUiRecords({ kind: "opportunity", queryable });
  assert.match(calls[1].sql, /NOT IN \('won', 'lost'\)/);
  assert.equal(calls[1].values[3], "opportunity");

  calls.length = 0;
  await readCentralUiRecords({ kind: "task", queryable });
  assert.match(calls[1].sql, /NOT IN \('done', 'cancelled'\)/);
  assert.equal(calls[1].values[3], "task");
});

test("le résolveur central cible un identifiant exact et garde sa mutation la plus récente", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const older = sourceRow({
    source_id: "notion_old",
    object_type: "opportunity",
    title: "Extension Nova",
    content_json: {
      id: "OPP-404",
      name: "Extension Nova",
      amount: 72_000,
      stage: "Proposition",
      probability: 60,
      next: "Ancienne action",
    },
    source_updated_at: "2026-07-16T08:00:00.000Z",
  });
  const controlled = sourceRow({
    source_id: "OPP-404",
    object_type: "opportunity",
    title: "Extension Nova",
    content_json: {
      id: "OPP-404",
      name: "Extension Nova",
      amount: 72_000,
      stage: "Négociation",
      probability: 78,
      next: "Arbitrage budget lundi",
    },
    source_type: "ops_action",
    source_updated_at: "2026-07-17T08:00:00.000Z",
  });
  const queryable: SqlQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      return result((sql.includes("FROM ops_memory.organizations")
        ? [{ id: "org-1" }]
        : [controlled, older]) as unknown as Row[]);
    },
  };

  const record = await readCentralUiRecordById({
    id: "opp-404",
    kind: "opportunity",
    queryable,
  });

  assert.equal(calls[1].values[4], "opp-404");
  assert.match(calls[1].sql, /upper\(COALESCE/);
  assert.equal(record?.id, "OPP-404");
  assert.equal(record?.attributes.stage, "Négociation");
  assert.equal(record?.attributes.next_action, "Arbitrage budget lundi");
});

test("le mapping client restitue les agrégats, le propriétaire et le contact principal", () => {
  const row = sourceRow({
    source_id: "company_0001",
    object_type: "client",
    title: "Vitreflam",
    content_json: {
      id: "CLT-VITREFLAM",
      kind: "client",
      name: "Vitreflam",
      status: "client",
      healthScore: 84,
      accountOwnerId: "USR-MARIE",
      segment: "construction",
      city: "Paris",
    },
    metadata: { externalId: "CLT-VITREFLAM" },
    owner_name: "Marie Delmas",
    primary_contact_email: "fabien.morel@vitreflam.example",
    revenue_cents: "9400000",
    margin_percent: "33.4",
    last_interaction_at: "2026-07-16T09:00:00.000Z",
    next_opportunity: "Automatisation des avis · 19 K€",
  });

  const client = mapCentralSourceObject(row, "client");
  assert.ok(client);
  assert.equal(client.id, "CLT-VITREFLAM");
  assert.equal(client.attributes.status, "Actif");
  assert.equal(client.attributes.owner, "Marie Delmas");
  assert.equal(client.attributes.revenue_12m, 94_000);
  assert.equal(client.attributes.margin_percent, 33.4);
  assert.equal(client.attributes.health_score, 84);
  assert.equal(client.attributes.email, "fabien.morel@vitreflam.example");
  assert.equal(client.attributes.next_opportunity, "Automatisation des avis · 19 K€");
  assert.match(String(client.attributes.last_interaction), /16 juil/);
});

test("la mémoire centrale remplace les doublons exacts et sémantiques de la projection", () => {
  const central = mapCentralSourceObject(sourceRow(), "email");
  assert.ok(central);
  const projectedDuplicate: CentralUiRecord = {
    ...central,
    id: "EMAIL-OBSIDIAN-01",
    summary: "Ancienne projection",
    path: "04_Conversations/Emails/email.md",
  };
  const projectedUnique: CentralUiRecord = {
    ...central,
    id: "EMAIL-OBSIDIAN-02",
    title: "Autre sujet",
    createdAt: "2026-07-15T10:00:00.000Z",
  };

  const merged = mergeCentralAndProjectedRecords(
    [central],
    [projectedDuplicate, projectedUnique],
  );
  assert.deepEqual(merged.map((record) => record.id), [
    "EMAIL-00001",
    "EMAIL-OBSIDIAN-02",
  ]);
  assert.equal(merged[0].summary, central.summary);
});

const integrationUrl = process.env.OPS_INTEGRATION_DATABASE_URL?.trim();
test("intégration PostgreSQL: les quatre vues UI se lisent depuis la mémoire centrale", {
  skip: !integrationUrl,
}, async () => {
  const pool = createCentralMemoryPool({
    ...process.env,
    DATABASE_URL: integrationUrl,
    DATABASE_APPLICATION_NAME: "ops-records-integration-test",
  });
  try {
    const [emails, opportunities, tasks, clients] = await Promise.all([
      readCentralUiRecords({ kind: "email", queryable: pool }),
      readCentralUiRecords({ kind: "opportunity", queryable: pool }),
      readCentralUiRecords({ kind: "task", queryable: pool }),
      readCentralUiRecords({ kind: "client", queryable: pool }),
    ]);
    assert.ok(emails.length >= 11);
    // The integration database can retain controlled UI mutations created by
    // earlier end-to-end tests, in addition to the four seeded open deals.
    assert.ok(opportunities.length >= 4);
    assert.ok(tasks.length > 0);
    assert.ok(clients.length >= 30);
    assert.ok(emails.every((record) => record.attributes.record_kind === "email"));
    assert.ok(opportunities.every((record) => record.attributes.record_kind === "opportunity"));
    assert.ok(tasks.every((record) => record.attributes.record_kind === "task"));
    assert.ok(clients.every((record) => record.attributes.record_kind === "client"));
  } finally {
    await pool.end();
  }
});

test("intégration PostgreSQL: OPP, CLT et TSK centraux se modifient sans note legacy", {
  skip: !integrationUrl,
}, async () => {
  const vault = await mkdtemp(path.join(tmpdir(), "ops-central-patch-"));
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousVaultPath = process.env.OBSIDIAN_VAULT_PATH;
  process.env.DATABASE_URL = integrationUrl;
  process.env.OBSIDIAN_VAULT_PATH = vault;
  await closeCentralMemoryPool();

  const pool = createCentralMemoryPool({
    ...process.env,
    DATABASE_URL: integrationUrl,
    DATABASE_APPLICATION_NAME: "ops-record-patch-integration-test",
  });
  try {
    // Each run must exercise a fresh controlled action. Reusing a static
    // idempotency key would correctly replay the previous response while the
    // integration database may already contain a later mutation.
    const runId = randomUUID();
    const [opportunities, clients, tasks] = await Promise.all([
      readCentralUiRecords({ kind: "opportunity", queryable: pool }),
      readCentralUiRecords({ kind: "client", queryable: pool }),
      readCentralUiRecords({ kind: "task", queryable: pool }),
    ]);
    const opportunity = opportunities.find((record) => record.id.startsWith("OPP-"));
    const client = clients.find((record) => record.id.startsWith("CLT-"));
    const task = tasks.find((record) => record.id.startsWith("TSK-"));
    assert.ok(opportunity, "une opportunité centrale OPP est requise");
    assert.ok(client, "un client central CLT est requis");
    assert.ok(task, "une tâche centrale TSK est requise");

    const { PATCH } = await import("@/app/api/records/route");
    const mutations = [
      {
        kind: "opportunity",
        id: opportunity.id,
        patch: { next: "Revue de marge intégrée vendredi" },
      },
      {
        kind: "client",
        id: client.id,
        patch: { health: 83 },
      },
      {
        kind: "task",
        id: task.id,
        patch: { status: "in_progress" },
      },
    ] as const;

    for (const mutation of mutations) {
      const response = await PATCH(new Request("http://localhost/api/records", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "idempotency-key": `integration-central-patch:${mutation.id}:${runId}`,
        },
        body: JSON.stringify({
          kind: mutation.kind,
          id: mutation.id,
          ...mutation.patch,
        }),
      }));
      const payload = await response.json() as {
        record?: { id: string; path: string };
        error?: string;
      };
      assert.equal(response.status, 200, `${mutation.id}: ${payload.error ?? "échec"}`);
      assert.equal(payload.record?.id, mutation.id);
      assert.ok(payload.record?.path);
      const projected = await readFile(path.join(
        vault,
        "OPS — Atelier Beaumarchais",
        payload.record.path,
      ), "utf8");
      assert.match(projected, new RegExp(`id: ${mutation.id}`));
      assert.match(projected, new RegExp(`record_kind: ["']?${mutation.kind}["']?`));
    }

    const [updatedOpportunity, updatedClient, updatedTask] = await Promise.all([
      readCentralUiRecordById({ id: opportunity.id, kind: "opportunity", queryable: pool }),
      readCentralUiRecordById({ id: client.id, kind: "client", queryable: pool }),
      readCentralUiRecordById({ id: task.id, kind: "task", queryable: pool }),
    ]);
    assert.equal(updatedOpportunity?.attributes.next_action, "Revue de marge intégrée vendredi");
    assert.equal(updatedClient?.attributes.health_score, 83);
    assert.equal(updatedTask?.attributes.status, "in_progress");

    const projectionStates = await pool.query<{ projection_key: string; projection_status: string }>(`
      SELECT projection_key, projection_status
      FROM ops_memory.knowledge_projections projection
      JOIN ops_memory.organizations organization ON organization.id = projection.organization_id
      WHERE organization.slug = 'atelier-beaumarchais'
        AND projection_key = ANY($1::text[])
    `, [mutations.map((mutation) => mutation.id)]);
    assert.equal(projectionStates.rows.length, 3);
    assert.ok(projectionStates.rows.every((row) => row.projection_status === "projected"));

    const audits = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM ops_memory.audit_logs audit
      JOIN ops_memory.organizations organization ON organization.id = audit.organization_id
      WHERE organization.slug = 'atelier-beaumarchais'
        AND audit.resource_id = ANY($1::text[])
        AND audit.action IN ('opportunity.updated', 'client.updated', 'task.updated')
    `, [mutations.map((mutation) => mutation.id)]);
    assert.ok(Number(audits.rows[0]?.count ?? 0) >= 3);

    // PostgreSQL remains authoritative if the filesystem projection becomes
    // unavailable after the exact central record has been resolved.
    process.env.OBSIDIAN_VAULT_PATH = path.join(vault, "vault-indisponible");
    const projectionFailure = await PATCH(new Request("http://localhost/api/records", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "idempotency-key": `integration-central-patch:${opportunity.id}:projection-failure:${runId}`,
      },
      body: JSON.stringify({
        kind: "opportunity",
        id: opportunity.id,
        next: "Mutation centrale conservée malgré projection indisponible",
      }),
    }));
    const failurePayload = await projectionFailure.json() as {
      centralMemory?: boolean;
      projection?: string;
    };
    assert.equal(projectionFailure.status, 202);
    assert.equal(failurePayload.centralMemory, true);
    assert.equal(failurePayload.projection, "pending_retry");
    const centrallyCommitted = await readCentralUiRecordById({
      id: opportunity.id,
      kind: "opportunity",
      queryable: pool,
    });
    assert.equal(
      centrallyCommitted?.attributes.next_action,
      "Mutation centrale conservée malgré projection indisponible",
    );
    const failedProjection = await pool.query<{ projection_status: string }>(`
      SELECT projection_status
      FROM ops_memory.knowledge_projections projection
      JOIN ops_memory.organizations organization ON organization.id = projection.organization_id
      WHERE organization.slug = 'atelier-beaumarchais'
        AND projection.projection_key = $1
    `, [opportunity.id]);
    assert.equal(failedProjection.rows[0]?.projection_status, "failed");
    process.env.OBSIDIAN_VAULT_PATH = vault;

    const journal = await readFile(path.join(
      vault,
      "OPS — Atelier Beaumarchais",
      "00_System",
      "LOG — Journal de la mémoire OPS.md",
    ), "utf8");
    for (const mutation of mutations) assert.match(journal, new RegExp(mutation.id));
  } finally {
    await pool.end();
    await closeCentralMemoryPool();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousVaultPath === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = previousVaultPath;
    await rm(vault, { recursive: true, force: true });
  }
});
