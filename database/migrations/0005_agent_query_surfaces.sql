-- Stable query surfaces for the agent and the Cerveau graph. They expose only
-- active records; callers must still scope every query by organization_id and
-- enforce confidentiality/allowed_groups.

CREATE OR REPLACE VIEW ops_memory.memory_search_corpus AS
SELECT
  source.organization_id,
  'source_object'::text AS record_type,
  source.id AS record_id,
  source.object_type AS subtype,
  COALESCE(source.title, source.source_id) AS title,
  COALESCE(source.content_text, '') AS content,
  source.source_type,
  source.source_id,
  source.last_event_id AS source_event_id,
  source.confidentiality,
  source.allowed_groups,
  source.updated_at,
  to_tsvector('simple', COALESCE(source.title, '') || ' ' || COALESCE(source.content_text, '')) AS search_vector
FROM ops_memory.source_objects source
WHERE source.deleted_at IS NULL AND source.is_current
UNION ALL
SELECT
  fact.organization_id,
  'fact'::text,
  fact.id,
  fact.fact_type,
  fact.fact_key,
  COALESCE(
    fact.value_text,
    fact.value_number::text,
    fact.value_boolean::text,
    fact.value_date::text,
    fact.value_json::text,
    ''
  ),
  'knowledge'::text,
  fact.fact_key,
  fact.source_event_id,
  fact.confidentiality,
  fact.allowed_groups,
  fact.updated_at,
  to_tsvector(
    'simple',
    fact.fact_key || ' ' || COALESCE(fact.value_text, fact.value_json::text, '')
  )
FROM ops_memory.facts fact
WHERE fact.deleted_at IS NULL AND fact.status <> 'superseded'
UNION ALL
SELECT
  document.organization_id,
  'document'::text,
  document.id,
  COALESCE(document.document_type, document.mime_type),
  COALESCE(document.title, document.file_name),
  COALESCE(document.extracted_text, ''),
  document.storage_provider,
  document.storage_key,
  NULL::uuid,
  document.confidentiality,
  document.allowed_groups,
  document.updated_at,
  to_tsvector(
    'simple',
    COALESCE(document.title, document.file_name) || ' ' || COALESCE(document.extracted_text, '')
  )
FROM ops_memory.documents document
WHERE document.deleted_at IS NULL;

CREATE OR REPLACE VIEW ops_memory.graph_nodes AS
SELECT
  entity.organization_id,
  entity.id,
  entity.entity_type AS node_type,
  entity.display_name AS label,
  entity.summary,
  entity.attributes,
  entity.confidentiality,
  entity.allowed_groups,
  entity.confidence,
  (
    SELECT count(*)::integer
    FROM ops_memory.relations relation
    WHERE relation.organization_id = entity.organization_id
      AND relation.deleted_at IS NULL
      AND (
        relation.subject_entity_id = entity.id
        OR relation.object_entity_id = entity.id
      )
  ) AS degree,
  (
    SELECT count(*)::integer
    FROM ops_memory.facts fact
    WHERE fact.organization_id = entity.organization_id
      AND fact.subject_entity_id = entity.id
      AND fact.deleted_at IS NULL
      AND fact.status <> 'superseded'
  ) AS fact_count,
  entity.last_seen_at,
  entity.updated_at
FROM ops_memory.entities entity
WHERE entity.deleted_at IS NULL;

CREATE OR REPLACE VIEW ops_memory.graph_edges AS
SELECT
  relation.organization_id,
  relation.id,
  relation.subject_entity_id AS source_id,
  relation.object_entity_id AS target_id,
  relation.predicate AS edge_type,
  relation.properties,
  relation.confidence,
  relation.confidentiality,
  relation.allowed_groups,
  relation.observed_at,
  relation.updated_at
FROM ops_memory.relations relation
WHERE relation.deleted_at IS NULL;

COMMENT ON VIEW ops_memory.memory_search_corpus IS
  'Unified active corpus for keyword retrieval before vector reranking.';
COMMENT ON VIEW ops_memory.graph_nodes IS
  'Active entity nodes for the OPS/Obsidian-style Cerveau visualization.';
COMMENT ON VIEW ops_memory.graph_edges IS
  'Active entity relations for the OPS/Obsidian-style Cerveau visualization.';
