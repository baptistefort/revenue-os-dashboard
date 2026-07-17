import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createCentralMemoryPool } from "@/lib/central-memory/database";
import { ConnectorKnowledgeIngestionService } from "@/lib/central-memory/connector-ingestion";
import { CentralMemoryRepository } from "@/lib/central-memory/repository";

const integrationUrl = process.env.OPS_INTEGRATION_DATABASE_URL;

function event(tenantId: string, input: {
  eventId: string;
  version: string;
  observedAt: string;
  operation?: "upsert" | "delete";
  includeDetails?: boolean;
}) {
  if (input.operation === "delete") {
    return {
      eventId: input.eventId,
      tenantId,
      source: "gmail",
      sourceAccountId: "direction",
      sourceRecordId: "gmail-message-92831",
      sourceVersion: input.version,
      operation: "delete",
      observedAt: input.observedAt,
      access: { confidentiality: "confidential", allowedGroups: ["direction"], containsPersonalData: true },
    };
  }
  return {
    eventId: input.eventId,
    tenantId,
    source: "gmail",
    sourceAccountId: "direction",
    sourceRecordId: "gmail-message-92831",
    sourceVersion: input.version,
    operation: "upsert",
    observedAt: input.observedAt,
    access: { confidentiality: "confidential", allowedGroups: ["direction"], containsPersonalData: true },
    sourceObject: {
      objectType: "email",
      title: "Point Trustpilot Vitreflam",
      contentText: input.includeDetails ? "Fabien confirme le pilote et demande une réponse." : "Mise à jour du statut.",
      sourceUpdatedAt: input.observedAt,
    },
    payload: {
      entities: [
        { ref: "company", kind: "organization", name: "Vitreflam", identifiers: [{ scheme: "domain", value: "vitreflam.fr" }] },
        ...(input.includeDetails ? [{ ref: "fabien", kind: "person", name: "Fabien Martin", identifiers: [{ scheme: "email", value: "fabien@vitreflam.fr" }] }] : []),
      ],
      facts: input.includeDetails ? [{ key: "support", subjectRef: "company", predicate: "support_status", value: "à traiter" }] : [],
      relations: input.includeDetails ? [{ fromRef: "fabien", toRef: "company", type: "works_for" }] : [],
      commitments: input.includeDetails ? [{ key: "capture", ownerRef: "fabien", beneficiaryRef: "company", action: "Envoyer une capture", status: "open" }] : [],
      decisions: input.includeDetails ? [{ key: "pilot", subjectRef: "company", decidedByRef: "fabien", decision: "Lancer le pilote", status: "approved" }] : [],
      tasks: input.includeDetails ? [{ key: "reply", subjectRef: "company", ownerRef: "fabien", title: "Répondre à Fabien", status: "open" }] : [],
      metrics: [{ key: "trustpilot", subjectRef: "company", name: "Note Trustpilot", value: input.includeDetails ? 4.6 : 4.7, unit: "/5" }],
      notes: input.includeDetails ? [{ key: "trustpilot-incident", title: "Incident Trustpilot", summary: "Lien à réinitialiser", entityRefs: ["company", "fabien"] }] : [],
    },
  };
}

test("pipeline PostgreSQL: upsert, identité, provenance, idempotence, stale et soft-delete", {
  skip: integrationUrl ? false : "OPS_INTEGRATION_DATABASE_URL is not configured",
}, async () => {
  const pool = createCentralMemoryPool({
    DATABASE_URL: integrationUrl,
    DATABASE_POOL_MAX: "2",
    DATABASE_APPLICATION_NAME: "ops-connector-ingestion-test",
  });
  const repository = new CentralMemoryRepository(pool);
  const service = new ConnectorKnowledgeIngestionService(pool);
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `ingestion-${suffix}`;
  const actor = { actorId: "gmail-direction", requestId: `req-${suffix}`, correlationId: `corr-${suffix}` };

  try {
    const organization = await repository.upsertOrganization({ slug: tenantId, displayName: "Ingestion test" });
    const firstEvent = event(tenantId, {
      eventId: `gmail-v1-${suffix}`,
      version: "1",
      observedAt: "2026-07-17T08:00:00.000Z",
      includeDetails: true,
    });
    const first = await service.ingest(firstEvent, actor);
    assert.equal(first.processingState, "processed");
    assert.equal(first.duplicate, false);
    assert.deepEqual(first.counts, {
      entities: 2,
      relations: 1,
      facts: 1,
      metrics: 1,
      commitments: 1,
      decisions: 1,
      tasks: 1,
      notes: 1,
      softDeleted: 0,
    });

    const duplicate = await service.ingest(firstEvent, actor);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.processingState, "processed");
    assert.equal(Object.values(duplicate.counts).reduce((sum, count) => sum + count, 0), 0);

    const updated = await service.ingest(event(tenantId, {
      eventId: `gmail-v2-${suffix}`,
      version: "2",
      observedAt: "2026-07-17T09:00:00.000Z",
      includeDetails: false,
    }), actor);
    assert.equal(updated.processingState, "processed");
    assert.equal(updated.counts.metrics, 1);
    assert.ok(updated.counts.softDeleted >= 5);

    const stale = await service.ingest(event(tenantId, {
      eventId: `gmail-stale-${suffix}`,
      version: "1.5",
      observedAt: "2026-07-17T08:30:00.000Z",
      includeDetails: true,
    }), actor);
    assert.equal(stale.processingState, "ignored");
    assert.equal(stale.stale, true);

    const deletion = await service.ingest(event(tenantId, {
      eventId: `gmail-delete-${suffix}`,
      version: "3",
      observedAt: "2026-07-17T10:00:00.000Z",
      operation: "delete",
    }), actor);
    assert.equal(deletion.processingState, "processed");
    assert.ok(deletion.counts.softDeleted >= 1);

    const counts = await pool.query<{
      events: number;
      current_objects: number;
      active_metrics: number;
      active_evidence: number;
      processed_audits: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM ops_memory.source_events WHERE organization_id = $1) AS events,
        (SELECT count(*)::int FROM ops_memory.source_objects WHERE organization_id = $1 AND is_current AND source_deleted_at IS NULL) AS current_objects,
        (SELECT count(*)::int FROM ops_memory.metric_observations WHERE organization_id = $1 AND deleted_at IS NULL) AS active_metrics,
        (SELECT count(*)::int FROM ops_memory.knowledge_evidence WHERE organization_id = $1 AND deleted_at IS NULL) AS active_evidence,
        (SELECT count(*)::int FROM ops_memory.audit_logs WHERE organization_id = $1 AND action IN ('connector_knowledge.processed', 'connector_event.ignored_stale', 'connector_object.soft_deleted')) AS processed_audits
    `, [organization.id]);
    assert.deepEqual(counts.rows[0], {
      events: 4,
      current_objects: 0,
      active_metrics: 0,
      active_evidence: 0,
      processed_audits: 4,
    });

    const confidentiality = await pool.query<{
      source_confidentiality: string;
      pii: boolean;
      groups: string[];
    }>(`
      SELECT confidentiality AS source_confidentiality,
        contains_personal_data AS pii, allowed_groups AS groups
      FROM ops_memory.source_objects
      WHERE organization_id = $1 AND source_id = 'gmail-message-92831'
    `, [organization.id]);
    assert.deepEqual(confidentiality.rows[0], {
      source_confidentiality: "confidential",
      pii: true,
      groups: ["direction"],
    });
  } finally {
    await pool.end();
  }
});
