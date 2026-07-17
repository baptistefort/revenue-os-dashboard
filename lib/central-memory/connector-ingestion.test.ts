import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeConnectorIngestion,
  parseConnectorKnowledgeEvent,
} from "@/lib/central-memory/connector-ingestion";

function validEvent() {
  return {
    eventId: "gmail-message-92831-v1",
    tenantId: "atelier-beaumarchais",
    source: "gmail",
    sourceAccountId: "direction",
    sourceRecordId: "message-92831",
    sourceVersion: "1",
    operation: "upsert",
    observedAt: "2026-07-17T08:00:00.000Z",
    occurredAt: "2026-07-17T07:59:30.000Z",
    access: {
      confidentiality: "confidential",
      allowedGroups: ["direction"],
      containsPersonalData: true,
      retentionUntil: "2031-07-17T00:00:00.000Z",
    },
    sourceObject: {
      objectType: "email",
      title: "Demande concernant Trustpilot",
      contentText: "Fabien indique que le lien de connexion ne fonctionne pas.",
      metadata: { threadId: "thread-77", labels: ["INBOX"] },
      sourceUpdatedAt: "2026-07-17T08:00:00.000Z",
    },
    payload: {
      entities: [
        {
          ref: "vitreflam",
          kind: "organization",
          name: "Vitreflam",
          identifiers: [{ scheme: "domain", value: "vitreflam.fr" }],
        },
        {
          ref: "fabien",
          kind: "person",
          name: "Fabien Martin",
          identifiers: [{ scheme: "email", value: "fabien@vitreflam.fr" }],
        },
      ],
      facts: [{ subjectRef: "vitreflam", predicate: "support_status", value: "à traiter" }],
      relations: [{ fromRef: "fabien", toRef: "vitreflam", type: "works_for" }],
      commitments: [{ ownerRef: "fabien", beneficiaryRef: "vitreflam", action: "Envoyer une capture", status: "open" }],
      decisions: [{ subjectRef: "vitreflam", decidedByRef: "fabien", decision: "Réinitialiser le lien", status: "approved" }],
      tasks: [{ subjectRef: "vitreflam", ownerRef: "fabien", title: "Répondre à la demande", status: "open" }],
      metrics: [{ subjectRef: "vitreflam", name: "Délai de réponse", value: 12, unit: "minutes" }],
      notes: [{ key: "support-trustpilot", title: "Incident Trustpilot", summary: "Lien invalide", entityRefs: ["vitreflam", "fabien"] }],
    },
  };
}

test("valide un événement de connecteur complet et normalise les valeurs par défaut", () => {
  const parsed = parseConnectorKnowledgeEvent(validEvent());
  assert.equal(parsed.source, "gmail");
  assert.equal(parsed.sourceAccountId, "direction");
  assert.equal(parsed.access.confidentiality, "confidential");
  assert.equal(parsed.payload?.relations?.[0]?.type, "works_for");
});

test("impose un objet source et un payload pour chaque upsert", () => {
  const missingObject = validEvent();
  delete (missingObject as Partial<ReturnType<typeof validEvent>>).sourceObject;
  assert.throws(() => parseConnectorKnowledgeEvent(missingObject), /sourceObject is required/);

  const missingPayload = validEvent();
  delete (missingPayload as Partial<ReturnType<typeof validEvent>>).payload;
  assert.throws(() => parseConnectorKnowledgeEvent(missingPayload), /payload is required/);
});

test("refuse les références orphelines et les refs dupliquées avant PostgreSQL", () => {
  const orphan = validEvent();
  orphan.payload.tasks = [{ subjectRef: "inconnu", ownerRef: "fabien", title: "Tâche orpheline", status: "open" }];
  assert.throws(() => parseConnectorKnowledgeEvent(orphan), /unknown_entity_ref:inconnu/);

  const duplicate = validEvent();
  duplicate.payload.entities.push({
    ref: "fabien",
    kind: "person",
    name: "Doublon Fabien",
    identifiers: [{ scheme: "email", value: "other@example.test" }],
  });
  assert.throws(() => parseConnectorKnowledgeEvent(duplicate), /duplicate_entity_ref/);
});

test("accepte une suppression sans recopier le contenu brut", () => {
  const deletion = {
    eventId: "gmail-message-92831-delete",
    tenantId: "atelier-beaumarchais",
    source: "gmail",
    sourceRecordId: "message-92831",
    sourceVersion: "2",
    operation: "delete",
    observedAt: "2026-07-18T08:00:00.000Z",
    access: { confidentiality: "internal" },
  };
  const parsed = parseConnectorKnowledgeEvent(deletion);
  assert.equal(parsed.operation, "delete");
  assert.equal(parsed.payload, undefined);
  assert.equal(parsed.sourceObject, undefined);
  assert.equal(parsed.sourceAccountId, "default");
});

test("limite strictement la surface et la taille des événements", () => {
  assert.throws(
    () => parseConnectorKnowledgeEvent({ ...validEvent(), unexpected: "field" }),
    /Unrecognized key/,
  );
  const huge = validEvent();
  huge.sourceObject.contentText = "x".repeat(2 * 1024 * 1024 + 1);
  assert.throws(() => parseConnectorKnowledgeEvent(huge), /connector_event_too_large/);
});

test("authentifie en temps constant et enferme le jeton dans son tenant", () => {
  const env = {
    OPS_INGESTION_TOKENS_JSON: JSON.stringify({
      "atelier-beaumarchais": "secret-atelier",
      "autre-entreprise": "secret-autre",
    }),
  };
  assert.deepEqual(
    authorizeConnectorIngestion("Bearer secret-atelier", "atelier-beaumarchais", env),
    { authorized: true, tenantId: "atelier-beaumarchais" },
  );
  assert.deepEqual(
    authorizeConnectorIngestion("Bearer secret-atelier", "autre-entreprise", env),
    { authorized: false, reason: "invalid" },
  );
  assert.deepEqual(
    authorizeConnectorIngestion(null, "atelier-beaumarchais", env),
    { authorized: false, reason: "missing" },
  );
});

test("le jeton simple ne donne accès qu'au tenant configuré", () => {
  const env = {
    OPS_INGESTION_TOKEN: "single-secret",
    OPS_ORGANIZATION_SLUG: "atelier-beaumarchais",
  };
  assert.equal(
    authorizeConnectorIngestion("Bearer single-secret", "atelier-beaumarchais", env).authorized,
    true,
  );
  assert.deepEqual(
    authorizeConnectorIngestion("Bearer single-secret", "entreprise-b", env),
    { authorized: false, reason: "tenant_not_allowed" },
  );
  assert.deepEqual(
    authorizeConnectorIngestion("Bearer nope", "atelier-beaumarchais", env),
    { authorized: false, reason: "invalid" },
  );
});
