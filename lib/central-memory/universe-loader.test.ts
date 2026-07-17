import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import { generateAtelierBeaumarchaisUniverse } from "@/lib/atelier-beaumarchais-universe";
import {
  deterministicMemoryUuid,
  loadAtelierUniverseToCentralMemory,
  type UniverseLoaderPool,
} from "@/lib/central-memory/universe-loader";

type RecordedQuery = { sql: string; values: unknown[] };

class FakeTransactionClient {
  readonly queries: RecordedQuery[] = [];
  released = 0;
  failWhenSqlIncludes: string | null = null;

  async query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.queries.push({ sql, values });
    if (this.failWhenSqlIncludes && sql.includes(this.failWhenSqlIncludes)) {
      throw new Error("injected database failure");
    }
    const rows = sql.includes("INSERT INTO ops_memory.organizations")
      ? [{ id: "11111111-1111-4111-8111-111111111111" }]
      : [];
    return {
      rows: rows as unknown as Row[],
      rowCount: rows.length,
      command: "INSERT",
      oid: 0,
      fields: [],
    };
  }

  release() {
    this.released += 1;
  }
}

class FakePool {
  readonly client = new FakeTransactionClient();
  connects = 0;

  async connect() {
    this.connects += 1;
    return this.client;
  }
}

function asPool(pool: FakePool) {
  return pool as unknown as UniverseLoaderPool;
}

function jsonRows(queries: RecordedQuery[], table: string) {
  return queries
    .filter((query) => query.sql.includes(`INSERT INTO ops_memory.${table}`) && query.sql.includes("jsonb_to_recordset"))
    .flatMap((query) => JSON.parse(String(query.values[0])) as Array<Record<string, unknown>>);
}

test("le loader importe atomiquement toutes les couches sans créer d'entité par email", async () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const pool = new FakePool();
  const result = await loadAtelierUniverseToCentralMemory(asPool(pool), universe, {
    batchSize: 173,
    sourceAccountId: "atelier-primary",
  });

  assert.equal(pool.connects, 1);
  assert.equal(pool.client.released, 1);
  assert.equal(pool.client.queries[0].sql, "BEGIN");
  assert.equal(pool.client.queries.at(-1)?.sql, "COMMIT");
  assert.equal(result.organizationId, "11111111-1111-4111-8111-111111111111");
  assert.equal(result.counts.sourceEvents, universe.sourceEvents.length);
  assert.equal(result.counts.sourceObjects, universe.sourceEvents.length);
  assert.equal(result.counts.relations, universe.relations.length);
  assert.ok(result.counts.facts > 150);
  assert.equal(result.counts.metricObservations, universe.metrics.length);
  assert.equal(result.counts.commitments, universe.commitments.length);
  assert.equal(result.counts.decisions, universe.decisions.length);
  assert.equal(result.counts.tasks, universe.tasks.length);
  assert.equal(result.counts.documents, universe.documents.length);

  const sourceObjects = jsonRows(pool.client.queries, "source_objects");
  assert.equal(sourceObjects.filter((row) => row.object_type === "email-message").length, universe.emailMessages.length);
  assert.ok(sourceObjects.every((row) => row.source_account_id === "atelier-primary"));

  const entities = jsonRows(pool.client.queries, "entities");
  const entityUpsertSql = pool.client.queries.find((query) => (
    query.sql.includes("INSERT INTO ops_memory.entities")
  ))?.sql || "";
  assert.ok(entities.some((row) => row.entity_type === "organization"));
  assert.equal(entities.filter((row) => row.entity_type === "team-member").length, universe.team.length);
  assert.equal(entities.filter((row) => row.entity_type === "email-message").length, 0);
  assert.equal(entities.filter((row) => row.entity_type === "metric").length, 0);
  assert.equal(entities.length, result.counts.entities);
  assert.match(entityUpsertSql, /controlled_source\.source_type = 'ops_action'/);
  assert.match(entityUpsertSql, /EXCLUDED\.attributes \|\| current_entity\.attributes/);

  const metrics = jsonRows(pool.client.queries, "metric_observations");
  assert.ok(metrics.some((row) => row.metric_key === "seo.impressions"));
  assert.ok(metrics.some((row) => row.metric_key === "finance.gross_margin"));
  assert.ok(metrics.every((row) => typeof row.dimensions_hash === "string" && String(row.dimensions_hash).length === 64));

  const facts = jsonRows(pool.client.queries, "facts");
  assert.equal(facts.length, result.counts.facts);
  assert.ok(facts.some((row) => row.fact_key === "client.health_score" && row.value_number !== null));
  assert.ok(facts.some((row) => row.fact_key === "opportunity.next_step" && typeof row.value_text === "string"));
  assert.ok(facts.some((row) => row.fact_key === "metric.google-ads.clicks.2026-07-01" && row.value_number === 428));
  assert.ok(facts.some((row) => row.fact_key === "metric.instagram.views.2026-07-01" && row.value_number === 18_400));
  assert.ok(facts.every((row) => typeof row.source_id === "string" && String(row.source_id).length > 0));
  assert.ok(facts.every((row) => [row.value_text, row.value_number, row.value_boolean].filter((value) => value !== null).length === 1));
});

test("deux chargements identiques produisent exactement les mêmes clés et payloads", async () => {
  const universe = generateAtelierBeaumarchaisUniverse({ seed: "loader-idempotency" });
  const first = new FakePool();
  const second = new FakePool();

  const firstResult = await loadAtelierUniverseToCentralMemory(asPool(first), universe, { batchSize: 500 });
  const secondResult = await loadAtelierUniverseToCentralMemory(asPool(second), universe, { batchSize: 500 });

  assert.deepEqual(firstResult, secondResult);
  const materialQueries = (pool: FakePool) => pool.client.queries
    .filter((query) => query.sql.includes("jsonb_to_recordset"))
    .map((query) => query.values[0]);
  assert.deepEqual(materialQueries(first), materialQueries(second));

  const eventRows = jsonRows(first.client.queries, "source_events");
  assert.equal(new Set(eventRows.map((row) => row.idempotency_key)).size, eventRows.length);
  assert.equal(new Set(eventRows.map((row) => row.id)).size, eventRows.length);
});

test("une erreur SQL annule toute la transaction et libère toujours la connexion", async () => {
  const universe = generateAtelierBeaumarchaisUniverse();
  const pool = new FakePool();
  pool.client.failWhenSqlIncludes = "INSERT INTO ops_memory.relations";

  await assert.rejects(
    loadAtelierUniverseToCentralMemory(asPool(pool), universe),
    /injected database failure/,
  );
  assert.equal(pool.client.released, 1);
  assert.ok(pool.client.queries.some((query) => query.sql === "ROLLBACK"));
  assert.ok(!pool.client.queries.some((query) => query.sql === "COMMIT"));
});

test("les UUID déterministes sont RFC-4122, stables et sensibles au namespace", () => {
  const first = deterministicMemoryUuid("atelier:Vitreflam");
  assert.equal(first, deterministicMemoryUuid("atelier:Vitreflam"));
  assert.notEqual(first, deterministicMemoryUuid("atelier:Rivoli"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
