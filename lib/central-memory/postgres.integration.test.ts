import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createCentralMemoryPool } from "@/lib/central-memory/database";
import { CentralMemoryRepository } from "@/lib/central-memory/repository";

const integrationUrl = process.env.OPS_INTEGRATION_DATABASE_URL;

test("repository persists an idempotent, related and audited memory flow", {
  skip: integrationUrl ? false : "OPS_INTEGRATION_DATABASE_URL is not configured",
}, async () => {
  const pool = createCentralMemoryPool({
    DATABASE_URL: integrationUrl,
    DATABASE_POOL_MAX: "2",
    DATABASE_APPLICATION_NAME: "ops-memory-integration-test",
  });
  const repository = new CentralMemoryRepository(pool);
  const suffix = randomUUID().slice(0, 8);

  try {
    const organization = await repository.upsertOrganization({
      slug: `integration-${suffix}`,
      displayName: "Integration workspace",
    });
    const input = {
      organizationId: organization.id,
      sourceType: "gmail",
      sourceAccountId: "direction",
      sourceId: `message-${suffix}`,
      eventType: "email.received",
      occurredAt: new Date("2026-07-17T08:30:00.000Z"),
      idempotencyKey: `gmail:direction:message-${suffix}:received`,
      payload: { subject: "Connexion Trustpilot" },
      sourceObject: {
        sourceId: `message-${suffix}`,
        objectType: "email",
        title: "Connexion Trustpilot",
        contentText: "Le lien ne fonctionne pas.",
        sourceUpdatedAt: new Date("2026-07-17T08:30:00.000Z"),
      },
      audit: { actorType: "connector" as const, actorId: "gmail-direction" },
    };

    const first = await repository.ingestSourceEvent(input);
    const duplicate = await repository.ingestSourceEvent(input);
    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.event.id, first.event.id);

    const company = await repository.upsertEntity({
      organizationId: organization.id,
      entityType: "company",
      canonicalKey: "vitreflam",
      displayName: "Vitreflam",
      sourceEventId: first.event.id,
      sourceObjectId: first.sourceObject?.id,
    });
    const contact = await repository.upsertEntity({
      organizationId: organization.id,
      entityType: "person",
      canonicalKey: "fabien",
      displayName: "Fabien",
      sourceEventId: first.event.id,
      sourceObjectId: first.sourceObject?.id,
    });
    const relation = await repository.upsertRelation({
      organizationId: organization.id,
      subjectEntityId: contact.id,
      predicate: "works_at",
      objectEntityId: company.id,
      sourceEventId: first.event.id,
      sourceObjectId: first.sourceObject?.id,
    });
    assert.equal(relation.predicate, "works_at");

    const search = await repository.searchMemory({
      organizationId: organization.id,
      query: "Trustpilot",
    });
    assert.equal(search[0]?.record_type, "source_object");
    assert.equal(search[0]?.source_id, `message-${suffix}`);

    const graph = await repository.getGraphSnapshot({ organizationId: organization.id });
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 1);

    const deleted = await repository.softDeleteEntity({
      organizationId: organization.id,
      entityId: contact.id,
      audit: { actorType: "human", actorId: "integration-test" },
    });
    assert.equal(deleted, true);

    const counts = await pool.query<{
      events: number;
      objects: number;
      relations: number;
      audits: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM ops_memory.source_events WHERE organization_id = $1) AS events,
        (SELECT count(*)::int FROM ops_memory.source_objects WHERE organization_id = $1) AS objects,
        (SELECT count(*)::int FROM ops_memory.relations WHERE organization_id = $1) AS relations,
        (SELECT count(*)::int FROM ops_memory.audit_logs WHERE organization_id = $1) AS audits
    `, [organization.id]);
    assert.deepEqual(counts.rows[0], { events: 1, objects: 1, relations: 1, audits: 2 });
  } finally {
    await pool.end();
  }
});
