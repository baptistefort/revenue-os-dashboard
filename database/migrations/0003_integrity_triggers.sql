CREATE OR REPLACE FUNCTION ops_memory.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$function$;

DO $migration$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations', 'source_events', 'source_objects', 'entities', 'relations',
    'facts', 'metric_observations', 'commitments', 'decisions', 'tasks',
    'documents', 'action_runs', 'sync_cursors', 'knowledge_projections'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON ops_memory.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON ops_memory.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION ops_memory.touch_updated_at()',
      table_name
    );
  END LOOP;
END
$migration$;

CREATE OR REPLACE FUNCTION ops_memory.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ops_memory.audit_logs is append-only';
END
$function$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON ops_memory.audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON ops_memory.audit_logs
  FOR EACH ROW EXECUTE FUNCTION ops_memory.reject_audit_mutation();

CREATE OR REPLACE FUNCTION ops_memory.validate_relation_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  subject_organization uuid;
  object_organization uuid;
BEGIN
  SELECT organization_id INTO subject_organization
    FROM ops_memory.entities WHERE id = NEW.subject_entity_id;
  SELECT organization_id INTO object_organization
    FROM ops_memory.entities WHERE id = NEW.object_entity_id;

  IF subject_organization IS DISTINCT FROM NEW.organization_id
     OR object_organization IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'relation entities must belong to organization %', NEW.organization_id;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS relations_same_tenant ON ops_memory.relations;
CREATE TRIGGER relations_same_tenant
  BEFORE INSERT OR UPDATE OF organization_id, subject_entity_id, object_entity_id
  ON ops_memory.relations
  FOR EACH ROW EXECUTE FUNCTION ops_memory.validate_relation_tenant();
