# Connector ingestion

`POST /api/connectors/ingest` is the authenticated server-to-server entry point
for Gmail, Notion, Slack, Drive, Calendar, CRM, SEO/Ads and finance events. It
never executes a user action; sends and mutations initiated by OPS remain in
`ops-action-executor`.

## Authentication and tenant boundary

Send all three headers:

```text
Authorization: Bearer <OPS_INGESTION_TOKEN>
X-OPS-Tenant: atelier-beaumarchais
X-OPS-Connector-Id: gmail:direction
```

The body `tenantId` must match `X-OPS-Tenant`. A single-tenant deployment uses
`OPS_INGESTION_TOKEN` plus `OPS_ORGANIZATION_SLUG`. A multi-tenant deployment
uses `OPS_INGESTION_TOKENS_JSON`, for example
`{"atelier-beaumarchais":"<secret-a>","company-b":"<secret-b>"}`. Tokens are
compared by digest in constant time and stay server-side.

## Event contract

An upsert carries one raw normalized `sourceObject` and a typed knowledge
`payload`. Entity references are validated before any database write.

```json
{
  "eventId": "gmail-message-92831-v1",
  "tenantId": "atelier-beaumarchais",
  "source": "gmail",
  "sourceAccountId": "direction",
  "sourceRecordId": "message-92831",
  "sourceVersion": "1",
  "operation": "upsert",
  "observedAt": "2026-07-17T08:00:00.000Z",
  "access": {
    "confidentiality": "confidential",
    "allowedGroups": ["direction"],
    "containsPersonalData": true
  },
  "sourceObject": {
    "objectType": "email",
    "title": "Demande Trustpilot",
    "contentText": "Le lien de connexion ne fonctionne pas."
  },
  "payload": {
    "entities": [{
      "ref": "client",
      "kind": "organization",
      "name": "Vitreflam",
      "identifiers": [{ "scheme": "domain", "value": "vitreflam.fr" }]
    }],
    "tasks": [{
      "subjectRef": "client",
      "title": "Réinitialiser le lien",
      "status": "open"
    }]
  }
}
```

The idempotency key is derived from tenant, source, account and `eventId`.
Duplicate delivery returns the existing result. Out-of-order source updates are
marked `ignored`; processing failures remain retryable. Every extracted record
is linked to `source_event` and `source_object` through `knowledge_evidence`, and
all lifecycle transitions append an immutable audit row.

A delete event only needs identity, version, timestamp, access and
`operation: "delete"`. It marks the source object and unsupported derived
records as deleted without destructive SQL and without removing knowledge still
supported by another source.

`GET /api/connectors/ingest` with the same authentication returns counts and
health statistics only; it never returns source content.
