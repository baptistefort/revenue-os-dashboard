import assert from "node:assert/strict";
import test from "node:test";
import type {
  CentralMemoryPool,
  TransactionClient,
} from "@/lib/central-memory/database";
import { CentralMemoryRepository } from "@/lib/central-memory/repository";

type QueuedResult = { rows?: unknown[]; rowCount?: number } | Error;

class FakeTransactionClient implements TransactionClient {
  readonly calls: Array<{ text: string; values?: unknown[] }> = [];
  released = false;

  constructor(private readonly results: QueuedResult[]) {}

  async query<Row>(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    const queued = this.results.shift() ?? {};
    if (queued instanceof Error) throw queued;
    return {
      rows: queued.rows ?? [],
      rowCount: queued.rowCount ?? (queued.rows?.length ?? 0),
      command: text.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? "",
      oid: 0,
      fields: [],
    } as never;
  }

  release() {
    this.released = true;
  }
}

class FakePool implements CentralMemoryPool {
  readonly directCalls: Array<{ text: string; values?: unknown[] }> = [];

  constructor(
    readonly client: FakeTransactionClient,
    private readonly directResults: QueuedResult[] = [],
  ) {}

  async connect() {
    return this.client;
  }

  async query<Row>(text: string, values?: unknown[]) {
    this.directCalls.push({ text, values });
    const queued = this.directResults.shift() ?? {};
    if (queued instanceof Error) throw queued;
    return {
      rows: queued.rows ?? [],
      rowCount: queued.rowCount ?? (queued.rows?.length ?? 0),
      command: "QUERY",
      oid: 0,
      fields: [],
    } as never;
  }

  async end() {}
}

const eventRow = {
  id: "e28ccf40-ea37-487f-b914-160a2dbd407f",
  organization_id: "3d3466fb-1aad-4fa5-9074-6bf60aa9f61b",
  source_type: "gmail",
  source_account_id: "direction",
  source_id: "email_92831",
  event_type: "email.received",
  occurred_at: "2026-07-17T08:00:00.000Z",
  idempotency_key: "gmail:direction:email_92831:received",
  processing_state: "pending",
};

const objectRow = {
  id: "414a3499-b3f2-4fb5-a20b-4a0808a28150",
  organization_id: eventRow.organization_id,
  source_type: "gmail",
  source_account_id: "direction",
  source_id: "email_92831",
  object_type: "email",
  title: "Demande concernant Trustpilot",
  source_updated_at: "2026-07-17T08:00:00.000Z",
};

test("withTransaction commits and releases exactly once", async () => {
  const client = new FakeTransactionClient([{}, { rows: [{ value: 42 }] }, {}]);
  const repository = new CentralMemoryRepository(new FakePool(client));

  const result = await repository.withTransaction(async (transaction) => {
    const query = await transaction.query<{ value: number }>("SELECT 42 AS value");
    return query.rows[0].value;
  });

  assert.equal(result, 42);
  assert.deepEqual(client.calls.map((call) => call.text), ["BEGIN", "SELECT 42 AS value", "COMMIT"]);
  assert.equal(client.released, true);
});

test("withTransaction rolls back the original failure and releases", async () => {
  const client = new FakeTransactionClient([{}, new Error("write failed"), {}]);
  const repository = new CentralMemoryRepository(new FakePool(client));

  await assert.rejects(
    repository.withTransaction((transaction) => transaction.query("UPDATE memory")),
    /write failed/,
  );
  assert.deepEqual(client.calls.map((call) => call.text), ["BEGIN", "UPDATE memory", "ROLLBACK"]);
  assert.equal(client.released, true);
});

test("source ingestion is parameterized, idempotent and audited in one transaction", async () => {
  const client = new FakeTransactionClient([
    {},
    { rows: [eventRow] },
    { rows: [objectRow] },
    {},
    {},
  ]);
  const repository = new CentralMemoryRepository(new FakePool(client));
  const result = await repository.ingestSourceEvent({
    organizationId: eventRow.organization_id,
    sourceType: "gmail",
    sourceAccountId: "direction",
    sourceId: "email_92831",
    eventType: "email.received",
    occurredAt: new Date("2026-07-17T08:00:00.000Z"),
    idempotencyKey: "gmail:direction:email_92831:received",
    payload: { subject: "Demande concernant Trustpilot" },
    sourceObject: {
      sourceId: "email_92831",
      objectType: "email",
      title: "Demande concernant Trustpilot",
      contentText: "Le lien de connexion ne fonctionne pas.",
      sourceUpdatedAt: new Date("2026-07-17T08:00:00.000Z"),
    },
    audit: { actorType: "connector", actorId: "gmail-direction" },
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.event.id, eventRow.id);
  assert.equal(result.sourceObject?.id, objectRow.id);
  assert.match(client.calls[1].text, /ON CONFLICT \(organization_id, idempotency_key\) DO NOTHING/);
  assert.match(client.calls[2].text, /version = ops_memory\.source_objects\.version \+ 1/);
  assert.match(client.calls[3].text, /INSERT INTO ops_memory\.audit_logs/);
  assert.deepEqual(client.calls.map((call) => call.text.trim().split(/\s+/, 1)[0]), [
    "BEGIN",
    "INSERT",
    "INSERT",
    "INSERT",
    "COMMIT",
  ]);
  assert.equal(client.released, true);
});

test("duplicate ingestion reuses the event and source object without a second audit", async () => {
  const client = new FakeTransactionClient([
    {},
    { rows: [] },
    { rows: [eventRow] },
    { rows: [objectRow] },
    {},
  ]);
  const repository = new CentralMemoryRepository(new FakePool(client));
  const result = await repository.ingestSourceEvent({
    organizationId: eventRow.organization_id,
    sourceType: "gmail",
    sourceAccountId: "direction",
    sourceId: "email_92831",
    eventType: "email.received",
    occurredAt: new Date("2026-07-17T08:00:00.000Z"),
    idempotencyKey: eventRow.idempotency_key,
    sourceObject: { sourceId: "email_92831", objectType: "email" },
    audit: { actorType: "connector", actorId: "gmail-direction" },
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.event.id, eventRow.id);
  assert.equal(client.calls.filter((call) => /audit_logs/.test(call.text)).length, 0);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("entity upsert uses the active canonical identity and rejects invalid confidence", async () => {
  const entity = {
    id: "f824ba45-37c7-4fc2-8372-15aec908977f",
    organization_id: eventRow.organization_id,
    entity_type: "company",
    canonical_key: "vitreflam",
    display_name: "Vitreflam",
    summary: null,
    attributes: {},
  };
  const pool = new FakePool(new FakeTransactionClient([]), [{ rows: [entity] }]);
  const repository = new CentralMemoryRepository(pool);
  const result = await repository.upsertEntity({
    organizationId: eventRow.organization_id,
    entityType: "company",
    canonicalKey: "vitreflam",
    displayName: "Vitreflam",
  });
  assert.equal(result.display_name, "Vitreflam");
  assert.match(pool.directCalls[0].text, /WHERE deleted_at IS NULL/);

  await assert.rejects(
    repository.upsertEntity({
      organizationId: eventRow.organization_id,
      entityType: "company",
      canonicalKey: "unsafe",
      displayName: "Unsafe",
      confidence: 1.2,
    }),
    /confidence must be between 0 and 1/,
  );
});

test("search and graph reads remain tenant-scoped and access-group constrained", async () => {
  const searchRow = {
    record_type: "document",
    record_id: "00000000-0000-4000-8000-000000000701",
    subtype: "seo-report",
    title: "Rapport SEO juillet",
    content: "Les clics organiques progressent.",
    source_type: "drive",
    source_id: "drive-seo-july",
    source_event_id: null,
    confidentiality: "confidential",
    updated_at: "2026-07-17T09:00:00.000Z",
    rank: 0.9,
  };
  const graphNode = {
    id: "00000000-0000-4000-8000-000000000702",
    node_type: "company",
    label: "Vitreflam",
    summary: null,
    attributes: {},
    confidence: 1,
    degree: 4,
    fact_count: 7,
  };
  const graphEdge = {
    id: "00000000-0000-4000-8000-000000000703",
    source_id: graphNode.id,
    target_id: graphNode.id,
    edge_type: "mentions",
    properties: {},
    confidence: 0.9,
  };
  const pool = new FakePool(new FakeTransactionClient([]), [
    { rows: [searchRow] },
    { rows: [graphNode] },
    { rows: [graphEdge] },
  ]);
  const repository = new CentralMemoryRepository(pool);
  const search = await repository.searchMemory({
    organizationId: eventRow.organization_id,
    query: "SEO juillet",
    allowedGroups: ["direction"],
    limit: 500,
  });
  const graph = await repository.getGraphSnapshot({
    organizationId: eventRow.organization_id,
    allowedGroups: ["direction"],
  });

  assert.equal(search[0].title, "Rapport SEO juillet");
  assert.equal(graph.nodes[0].label, "Vitreflam");
  assert.equal(graph.edges.length, 1);
  assert.match(pool.directCalls[0].text, /corpus\.organization_id = \$1/);
  assert.match(pool.directCalls[0].text, /corpus\.allowed_groups && \$3::text\[\]/);
  assert.equal(pool.directCalls[0].values?.[3], 100);
  assert.match(pool.directCalls[1].text, /organization_id = \$1/);
  assert.match(pool.directCalls[2].text, /source_id = ANY\(\$2::uuid\[\]\)/);
});
