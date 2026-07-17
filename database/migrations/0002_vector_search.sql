-- pgvector is an acceleration layer, not a hard dependency. The always-present
-- embedding_fallback arrays preserve portability to vanilla PostgreSQL.

DO $migration$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION
    WHEN undefined_file OR insufficient_privilege THEN
      RAISE NOTICE 'pgvector is unavailable; using double precision[] fallback columns';
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE ops_memory.source_objects ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    EXECUTE 'ALTER TABLE ops_memory.facts ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    EXECUTE 'ALTER TABLE ops_memory.documents ADD COLUMN IF NOT EXISTS embedding vector(1536)';

    EXECUTE 'CREATE INDEX IF NOT EXISTS source_objects_embedding_hnsw_idx '
      || 'ON ops_memory.source_objects USING hnsw (embedding vector_cosine_ops) '
      || 'WHERE deleted_at IS NULL AND embedding IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS facts_embedding_hnsw_idx '
      || 'ON ops_memory.facts USING hnsw (embedding vector_cosine_ops) '
      || 'WHERE deleted_at IS NULL AND embedding IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx '
      || 'ON ops_memory.documents USING hnsw (embedding vector_cosine_ops) '
      || 'WHERE deleted_at IS NULL AND embedding IS NOT NULL';
  END IF;
END
$migration$;
