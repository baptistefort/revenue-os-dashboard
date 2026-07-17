import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/connectors/ingest/route";

const secret = "route-secret-that-must-never-be-returned";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/connectors/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

test("l'endpoint connecteur exige un Bearer et ne divulgue jamais le secret", async () => {
  const previousToken = process.env.OPS_INGESTION_TOKEN;
  const previousTenant = process.env.OPS_ORGANIZATION_SLUG;
  process.env.OPS_INGESTION_TOKEN = secret;
  process.env.OPS_ORGANIZATION_SLUG = "atelier-beaumarchais";
  try {
    const missing = await POST(request("{}", { "X-OPS-Tenant": "atelier-beaumarchais" }));
    assert.equal(missing.status, 401);
    assert.doesNotMatch(await missing.text(), new RegExp(secret));

    const invalid = await POST(request("{}", {
      "X-OPS-Tenant": "atelier-beaumarchais",
      Authorization: "Bearer wrong-secret",
    }));
    assert.equal(invalid.status, 401);
    const text = await invalid.text();
    assert.doesNotMatch(text, /wrong-secret|route-secret|demo/i);
  } finally {
    if (previousToken === undefined) delete process.env.OPS_INGESTION_TOKEN;
    else process.env.OPS_INGESTION_TOKEN = previousToken;
    if (previousTenant === undefined) delete process.env.OPS_ORGANIZATION_SLUG;
    else process.env.OPS_ORGANIZATION_SLUG = previousTenant;
  }
});

test("rejette JSON invalide, schéma incomplet et tentative cross-tenant avant PostgreSQL", async () => {
  const previousToken = process.env.OPS_INGESTION_TOKEN;
  const previousTenant = process.env.OPS_ORGANIZATION_SLUG;
  process.env.OPS_INGESTION_TOKEN = secret;
  process.env.OPS_ORGANIZATION_SLUG = "atelier-beaumarchais";
  const headers = {
    "X-OPS-Tenant": "atelier-beaumarchais",
    Authorization: `Bearer ${secret}`,
  };
  try {
    const invalidJson = await POST(request("{", headers));
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).error, "invalid_json");

    const invalidSchema = await POST(request("{}", headers));
    assert.equal(invalidSchema.status, 422);
    assert.equal((await invalidSchema.json()).error, "invalid_connector_event");

    const crossTenant = await POST(request(JSON.stringify({
      eventId: "evt-cross",
      tenantId: "autre-entreprise",
      source: "gmail",
      sourceRecordId: "mail-1",
      sourceVersion: "1",
      operation: "delete",
      observedAt: "2026-07-17T08:00:00.000Z",
      access: { confidentiality: "internal" },
    }), headers));
    assert.equal(crossTenant.status, 403);
    assert.equal((await crossTenant.json()).error, "cross_tenant_event_rejected");
  } finally {
    if (previousToken === undefined) delete process.env.OPS_INGESTION_TOKEN;
    else process.env.OPS_INGESTION_TOKEN = previousToken;
    if (previousTenant === undefined) delete process.env.OPS_ORGANIZATION_SLUG;
    else process.env.OPS_ORGANIZATION_SLUG = previousTenant;
  }
});
