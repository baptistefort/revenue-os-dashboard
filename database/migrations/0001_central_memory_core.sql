-- OPS central memory: authoritative, append-friendly business memory.
-- Obsidian is a projection of this schema, never the transactional source.

CREATE SCHEMA IF NOT EXISTS ops_meta;
CREATE SCHEMA IF NOT EXISTS ops_memory;

CREATE TABLE IF NOT EXISTS ops_memory.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

CREATE TABLE IF NOT EXISTS ops_memory.source_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  source_type text NOT NULL,
  source_account_id text NOT NULL DEFAULT 'default',
  source_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  schema_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  content_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_state text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, idempotency_key),
  CHECK (schema_version > 0),
  CHECK (retry_count >= 0),
  CHECK (processing_state IN ('pending', 'processing', 'processed', 'failed', 'ignored'))
);

CREATE TABLE IF NOT EXISTS ops_memory.source_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  source_type text NOT NULL,
  source_account_id text NOT NULL DEFAULT 'default',
  source_id text NOT NULL,
  object_type text NOT NULL,
  title text,
  content_text text,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  mime_type text,
  content_hash text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  last_event_id uuid REFERENCES ops_memory.source_events(id),
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  embedding_fallback double precision[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_deleted_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (organization_id, source_type, source_account_id, source_id),
  CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS ops_memory.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  entity_type text NOT NULL,
  canonical_key text NOT NULL,
  display_name text NOT NULL,
  summary text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS entities_canonical_active_uniq
  ON ops_memory.entities (organization_id, entity_type, canonical_key)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_memory.entity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  entity_id uuid NOT NULL REFERENCES ops_memory.entities(id),
  alias_type text NOT NULL DEFAULT 'name',
  normalized_value text NOT NULL,
  display_value text NOT NULL,
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  confidence numeric(5,4) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_aliases_active_uniq
  ON ops_memory.entity_aliases (organization_id, alias_type, normalized_value, entity_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_memory.relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  subject_entity_id uuid NOT NULL REFERENCES ops_memory.entities(id),
  predicate text NOT NULL,
  object_entity_id uuid NOT NULL REFERENCES ops_memory.entities(id),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4) NOT NULL DEFAULT 1,
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  evidence_text text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (subject_entity_id <> object_entity_id),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS relations_active_uniq
  ON ops_memory.relations (organization_id, subject_entity_id, predicate, object_entity_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_memory.facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  subject_entity_id uuid REFERENCES ops_memory.entities(id),
  fact_type text NOT NULL,
  fact_key text NOT NULL,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date timestamptz,
  value_json jsonb,
  unit text,
  confidence numeric(5,4) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'asserted',
  observed_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz,
  valid_to timestamptz,
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  supersedes_fact_id uuid REFERENCES ops_memory.facts(id),
  embedding_fallback double precision[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (status IN ('asserted', 'inferred', 'disputed', 'superseded')),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (
    num_nonnulls(value_text, value_number, value_boolean, value_date, value_json) >= 1
  )
);

CREATE TABLE IF NOT EXISTS ops_memory.metric_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  entity_id uuid REFERENCES ops_memory.entities(id),
  metric_key text NOT NULL,
  value numeric NOT NULL,
  unit text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimensions_hash text NOT NULL DEFAULT '',
  observed_at timestamptz NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  granularity text NOT NULL DEFAULT 'instant',
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS metric_observations_active_uniq
  ON ops_memory.metric_observations (
    organization_id,
    metric_key,
    COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    observed_at,
    dimensions_hash
  ) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_memory.commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  external_key text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  debtor_entity_id uuid REFERENCES ops_memory.entities(id),
  beneficiary_entity_id uuid REFERENCES ops_memory.entities(id),
  project_entity_id uuid REFERENCES ops_memory.entities(id),
  committed_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  completed_at timestamptz,
  confidence numeric(5,4) NOT NULL DEFAULT 1,
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (status IN ('open', 'at_risk', 'fulfilled', 'cancelled', 'overdue')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS commitments_external_active_uniq
  ON ops_memory.commitments (organization_id, external_key)
  WHERE external_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_memory.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  external_key text,
  title text NOT NULL,
  summary text,
  rationale text,
  outcome text,
  status text NOT NULL DEFAULT 'decided',
  decided_at timestamptz NOT NULL,
  effective_at timestamptz,
  owner_entity_id uuid REFERENCES ops_memory.entities(id),
  project_entity_id uuid REFERENCES ops_memory.entities(id),
  meeting_entity_id uuid REFERENCES ops_memory.entities(id),
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  supersedes_decision_id uuid REFERENCES ops_memory.decisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (status IN ('proposed', 'decided', 'implemented', 'reversed', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS decisions_external_active_uniq
  ON ops_memory.decisions (organization_id, external_key)
  WHERE external_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_memory.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  external_key text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo',
  priority smallint NOT NULL DEFAULT 3,
  assigned_entity_id uuid REFERENCES ops_memory.entities(id),
  related_entity_id uuid REFERENCES ops_memory.entities(id),
  commitment_id uuid REFERENCES ops_memory.commitments(id),
  decision_id uuid REFERENCES ops_memory.decisions(id),
  due_at timestamptz,
  completed_at timestamptz,
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  CHECK (priority BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_external_active_uniq
  ON ops_memory.tasks (organization_id, external_key)
  WHERE external_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_memory.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  title text,
  document_type text,
  mime_type text NOT NULL,
  byte_size bigint,
  sha256 text,
  version integer NOT NULL DEFAULT 1,
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  related_entity_id uuid REFERENCES ops_memory.entities(id),
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding_fallback double precision[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, storage_provider, storage_key),
  CHECK (byte_size IS NULL OR byte_size >= 0),
  CHECK (version > 0),
  CHECK (extraction_status IN ('pending', 'processing', 'ready', 'failed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS ops_memory.action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  idempotency_key text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  requested_by text NOT NULL,
  agent_name text,
  related_entity_id uuid REFERENCES ops_memory.entities(id),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  approval_status text NOT NULL DEFAULT 'not_required',
  approved_by text,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  external_receipt jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, idempotency_key),
  CHECK (status IN ('proposed', 'queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CHECK (approval_status IN ('not_required', 'required', 'approved', 'rejected', 'expired'))
);

CREATE TABLE IF NOT EXISTS ops_memory.sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  connector_type text NOT NULL,
  source_account_id text NOT NULL DEFAULT 'default',
  cursor_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'idle',
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, connector_type, source_account_id),
  CHECK (status IN ('idle', 'syncing', 'succeeded', 'failed', 'paused'))
);

CREATE TABLE IF NOT EXISTS ops_memory.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  request_id text,
  correlation_id text,
  source_event_id uuid REFERENCES ops_memory.source_events(id),
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ops_memory.knowledge_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  entity_id uuid REFERENCES ops_memory.entities(id),
  projection_type text NOT NULL DEFAULT 'obsidian_markdown',
  projection_key text NOT NULL,
  content_hash text NOT NULL,
  rendered_content text NOT NULL,
  source_revision bigint NOT NULL DEFAULT 1,
  projected_at timestamptz,
  projection_status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, projection_type, projection_key),
  CHECK (source_revision > 0),
  CHECK (projection_status IN ('pending', 'projected', 'failed', 'stale'))
);

-- Lookup and timeline indexes. Every tenant-scoped query starts with organization_id.
CREATE INDEX IF NOT EXISTS source_events_pending_idx
  ON ops_memory.source_events (organization_id, processing_state, occurred_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS source_events_source_idx
  ON ops_memory.source_events (organization_id, source_type, source_account_id, source_id);
CREATE INDEX IF NOT EXISTS source_events_payload_gin_idx
  ON ops_memory.source_events USING gin (payload jsonb_path_ops);
CREATE INDEX IF NOT EXISTS source_objects_type_updated_idx
  ON ops_memory.source_objects (organization_id, object_type, source_updated_at DESC)
  WHERE deleted_at IS NULL AND is_current;
CREATE INDEX IF NOT EXISTS source_objects_content_fts_idx
  ON ops_memory.source_objects USING gin (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content_text, '')));
CREATE INDEX IF NOT EXISTS entities_type_name_idx
  ON ops_memory.entities (organization_id, entity_type, display_name)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entities_attributes_gin_idx
  ON ops_memory.entities USING gin (attributes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS relations_subject_idx
  ON ops_memory.relations (organization_id, subject_entity_id, predicate)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS relations_object_idx
  ON ops_memory.relations (organization_id, object_entity_id, predicate)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS facts_subject_time_idx
  ON ops_memory.facts (organization_id, subject_entity_id, fact_key, observed_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS facts_value_fts_idx
  ON ops_memory.facts USING gin (to_tsvector('simple', COALESCE(value_text, '')));
CREATE INDEX IF NOT EXISTS metric_observations_series_idx
  ON ops_memory.metric_observations (organization_id, metric_key, entity_id, observed_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS commitments_due_idx
  ON ops_memory.commitments (organization_id, status, due_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS decisions_time_idx
  ON ops_memory.decisions (organization_id, decided_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_queue_idx
  ON ops_memory.tasks (organization_id, status, priority, due_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_sha_idx
  ON ops_memory.documents (organization_id, sha256)
  WHERE deleted_at IS NULL AND sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_extracted_fts_idx
  ON ops_memory.documents USING gin (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(extracted_text, '')));
CREATE INDEX IF NOT EXISTS action_runs_status_idx
  ON ops_memory.action_runs (organization_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx
  ON ops_memory.audit_logs (organization_id, resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_correlation_idx
  ON ops_memory.audit_logs (organization_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON SCHEMA ops_memory IS
  'Authoritative OPS memory. Obsidian and the web graph are downstream projections.';
COMMENT ON TABLE ops_memory.source_events IS
  'Immutable-ish connector event inbox, deduplicated by organization and idempotency_key.';
COMMENT ON TABLE ops_memory.source_objects IS
  'Latest normalized projection of a Gmail, Notion, CRM, Slack, Drive or other source object.';
COMMENT ON TABLE ops_memory.audit_logs IS
  'Append-only audit trail. Updates and deletes are prevented by trigger in a later migration.';
