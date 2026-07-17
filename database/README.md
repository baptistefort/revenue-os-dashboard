# OPS central memory

PostgreSQL is the authoritative memory for connector events, reliable business
records, extracted knowledge and action receipts. The Obsidian vault remains a
human-readable downstream projection and is never touched by these migrations.

## Data levels

1. `source_events` and `source_objects` keep connector provenance and raw normalized data.
2. `entities`, `relations`, `facts`, `metric_observations`, `commitments`,
   `decisions` and `tasks` keep extracted business knowledge.
3. `knowledge_projections` queues durable Obsidian/web projections.
4. `action_runs` and append-only `audit_logs` prove what an agent proposed,
   approved and actually executed.

Every tenant-owned row carries `organization_id`. Connector ingestion uses an
idempotency key; business records use active partial unique indexes; operational
tables use `deleted_at` instead of destructive deletion.

The protected connector contract and example payload are documented in
[`CONNECTOR_INGESTION.md`](./CONNECTOR_INGESTION.md). Extracted records use the
`knowledge_evidence` junction so deletion of one upstream object cannot erase a
fact that remains supported by another source.

## Migrations

Production Compose runs `database-migrate` after PostgreSQL becomes healthy and
before the web service starts. Applied filenames and SHA-256 checksums are stored
in `ops_meta.schema_migrations`. A previously applied migration must never be
edited: add a new numbered migration instead.

For a machine with `psql` installed:

```sh
DATABASE_URL='postgresql://…' npm run db:migrate
DATABASE_URL='postgresql://…' npm run db:verify
```

`db:verify` performs its writes in a transaction and rolls them back. It checks
tenant isolation for graph relations, soft-delete identity reuse, audit
immutability, metrics and the portable embedding fallback.

## Vector search fallback

The production image includes pgvector and migration `0002` creates HNSW cosine
indexes. Vanilla PostgreSQL remains supported: `embedding_fallback` arrays and
full-text indexes are always created, while vector columns are conditional.

## Seed safety

Seeding is never part of the normal deployment. It requires both the Compose
`tools` profile and the explicit gate in `scripts/seed-database.sh`:

```sh
docker compose -f docker-compose.prod.yml --profile tools run --rm database-seed
```

Seed files have their own checksum ledger in `ops_meta.seed_runs`.

## Obsidian projection

Obsidian is regenerated from durable, tenant-scoped `entities` and `relations`:

```sh
DATABASE_URL='postgresql://…' \
OBSIDIAN_VAULT_PATH='/path/to/vault' \
npm run memory:project-central
```

The projector writes only under `Central/`, keeps a private manifest, updates
changed Markdown files atomically and deletes a stale file only when both the
manifest and its `managed_by: ops-central-memory-projector` marker prove
ownership. Existing manual notes are never overwritten. Raw `email-message`
entities are deliberately excluded; only durable threads and extracted
knowledge become notes.

## Backups

`deploy/vps/deploy.sh` keeps the existing Obsidian/document archive and, when a
database container already exists, adds a custom-format `database.dump` before
running migrations. PostgreSQL data itself lives in the persistent
`ops_postgres_data` volume.
