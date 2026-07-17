\set ON_ERROR_STOP on
BEGIN;

INSERT INTO ops_memory.organizations (id, slug, display_name)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'verification-one', 'Verification One'),
  ('00000000-0000-4000-8000-000000000002', 'verification-two', 'Verification Two');

INSERT INTO ops_memory.source_events (
  id, organization_id, source_type, source_account_id, source_id, event_type,
  occurred_at, idempotency_key, payload
) VALUES (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000001',
  'gmail', 'direction', 'message-1', 'email.received', now(),
  'verify:gmail:message-1', '{"safe":true}'::jsonb
);

INSERT INTO ops_memory.entities (
  id, organization_id, entity_type, canonical_key, display_name
) VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'company', 'vitreflam', 'Vitreflam'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'person', 'fabien', 'Fabien'
  ),
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000002',
    'company', 'other', 'Other tenant'
  );

INSERT INTO ops_memory.relations (
  organization_id, subject_entity_id, predicate, object_entity_id,
  source_event_id
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000102',
  'works_at',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000010'
);

DO $verification$
BEGIN
  BEGIN
    INSERT INTO ops_memory.relations (
      organization_id, subject_entity_id, predicate, object_entity_id
    ) VALUES (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000102',
      'works_at',
      '00000000-0000-4000-8000-000000000201'
    );
    RAISE EXCEPTION 'cross-tenant relation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-tenant relation was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'relation entities must belong to organization%' THEN RAISE; END IF;
  END;
END
$verification$;

INSERT INTO ops_memory.audit_logs (
  organization_id, actor_type, actor_id, action, resource_type, resource_id
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'system', 'schema-verifier', 'verification.created', 'entity',
  '00000000-0000-4000-8000-000000000101'
);

DO $verification$
DECLARE
  audit_id bigint;
BEGIN
  SELECT max(id) INTO audit_id FROM ops_memory.audit_logs;
  BEGIN
    UPDATE ops_memory.audit_logs SET action = 'tampered' WHERE id = audit_id;
    RAISE EXCEPTION 'audit mutation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'audit mutation was accepted' THEN RAISE; END IF;
    IF SQLERRM <> 'ops_memory.audit_logs is append-only' THEN RAISE; END IF;
  END;
END
$verification$;

INSERT INTO ops_memory.metric_observations (
  organization_id, entity_id, metric_key, value, unit, dimensions,
  dimensions_hash, observed_at
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'seo.clicks', 128, 'clicks', '{"channel":"organic"}'::jsonb,
  'organic', '2026-07-17T00:00:00Z'
);

UPDATE ops_memory.entities
SET deleted_at = now(), status = 'archived'
WHERE id = '00000000-0000-4000-8000-000000000101';

INSERT INTO ops_memory.entities (
  organization_id, entity_type, canonical_key, display_name
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'company', 'vitreflam', 'Vitreflam active replacement'
);

DO $verification$
DECLARE
  active_count integer;
  expected_tables integer;
BEGIN
  SELECT count(*) INTO active_count
  FROM ops_memory.entities
  WHERE organization_id = '00000000-0000-4000-8000-000000000001'
    AND entity_type = 'company' AND canonical_key = 'vitreflam'
    AND deleted_at IS NULL;
  IF active_count <> 1 THEN
    RAISE EXCEPTION 'expected one active canonical entity, got %', active_count;
  END IF;

  SELECT count(*) INTO expected_tables
  FROM information_schema.tables
  WHERE table_schema = 'ops_memory';
  IF expected_tables < 16 THEN
    RAISE EXCEPTION 'central memory schema is incomplete: % tables', expected_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ops_memory' AND table_name = 'documents'
      AND column_name = 'embedding_fallback'
  ) THEN
    RAISE EXCEPTION 'portable embedding fallback is missing';
  END IF;
END
$verification$;

ROLLBACK;
