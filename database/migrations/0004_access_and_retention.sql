-- Access metadata travels with knowledge so projections and agents can enforce
-- the same policy without copying sensitive content into unrestricted notes.

DO $migration$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'source_events', 'source_objects', 'entities', 'relations', 'facts',
    'commitments', 'decisions', 'tasks', 'documents', 'knowledge_projections'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE ops_memory.%I '
      || 'ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT ''internal'', '
      || 'ADD COLUMN IF NOT EXISTS allowed_groups text[] NOT NULL DEFAULT ''{}''::text[], '
      || 'ADD COLUMN IF NOT EXISTS contains_personal_data boolean NOT NULL DEFAULT false, '
      || 'ADD COLUMN IF NOT EXISTS retention_until timestamptz',
      table_name
    );

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = format('ops_memory.%I', table_name)::regclass
        AND conname = table_name || '_confidentiality_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE ops_memory.%I ADD CONSTRAINT %I '
        || 'CHECK (confidentiality IN (''public'', ''internal'', ''confidential'', ''restricted''))',
        table_name,
        table_name || '_confidentiality_check'
      );
    END IF;
  END LOOP;
END
$migration$;

CREATE INDEX IF NOT EXISTS source_objects_access_groups_gin_idx
  ON ops_memory.source_objects USING gin (allowed_groups)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entities_access_groups_gin_idx
  ON ops_memory.entities USING gin (allowed_groups)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_access_groups_gin_idx
  ON ops_memory.documents USING gin (allowed_groups)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS source_objects_retention_idx
  ON ops_memory.source_objects (organization_id, retention_until)
  WHERE deleted_at IS NULL AND retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_retention_idx
  ON ops_memory.documents (organization_id, retention_until)
  WHERE deleted_at IS NULL AND retention_until IS NOT NULL;
