-- Durable provenance for knowledge extracted from connector source objects.
-- A business record can be supported by several independent sources. Keeping
-- this as a junction prevents a Gmail deletion from erasing knowledge that is
-- still evidenced by Notion, CRM or another connector.

CREATE TABLE IF NOT EXISTS ops_memory.knowledge_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES ops_memory.organizations(id),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  evidence_key text NOT NULL DEFAULT 'primary',
  source_event_id uuid NOT NULL REFERENCES ops_memory.source_events(id),
  source_object_id uuid REFERENCES ops_memory.source_objects(id),
  observed_at timestamptz NOT NULL,
  confidence numeric(5,4) NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (resource_type IN (
    'entity', 'relation', 'fact', 'metric', 'commitment', 'decision', 'task', 'document'
  )),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_evidence_active_uniq
  ON ops_memory.knowledge_evidence (
    organization_id, resource_type, resource_id, source_event_id, evidence_key
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_evidence_source_object_idx
  ON ops_memory.knowledge_evidence (organization_id, source_object_id, source_event_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_evidence_resource_idx
  ON ops_memory.knowledge_evidence (organization_id, resource_type, resource_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION ops_memory.validate_knowledge_evidence_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  event_organization uuid;
  object_organization uuid;
BEGIN
  SELECT organization_id INTO event_organization
    FROM ops_memory.source_events WHERE id = NEW.source_event_id;
  IF event_organization IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'knowledge evidence event must belong to organization %', NEW.organization_id;
  END IF;

  IF NEW.source_object_id IS NOT NULL THEN
    SELECT organization_id INTO object_organization
      FROM ops_memory.source_objects WHERE id = NEW.source_object_id;
    IF object_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'knowledge evidence object must belong to organization %', NEW.organization_id;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS knowledge_evidence_same_tenant ON ops_memory.knowledge_evidence;
CREATE TRIGGER knowledge_evidence_same_tenant
  BEFORE INSERT OR UPDATE OF organization_id, source_event_id, source_object_id
  ON ops_memory.knowledge_evidence
  FOR EACH ROW EXECUTE FUNCTION ops_memory.validate_knowledge_evidence_tenant();

COMMENT ON TABLE ops_memory.knowledge_evidence IS
  'Many-to-many provenance between extracted knowledge and immutable connector events.';
