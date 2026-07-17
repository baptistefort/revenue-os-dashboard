#!/bin/sh
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required for database migrations." >&2
  exit 1
fi
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migration directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

psql_safe() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"
}

psql_safe <<'SQL'
CREATE SCHEMA IF NOT EXISTS ops_meta;
CREATE TABLE IF NOT EXISTS ops_meta.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

found="false"
for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  found="true"
  version="$(basename "$migration")"
  case "$version" in
    *[!A-Za-z0-9._-]*)
      echo "Unsafe migration filename: $version" >&2
      exit 1
      ;;
  esac
  checksum="$(sha256sum "$migration" | awk '{print $1}')"
  applied_checksum="$(psql_safe -Atqc "SELECT checksum FROM ops_meta.schema_migrations WHERE version = '$version'")"

  if [ -n "$applied_checksum" ]; then
    if [ "$applied_checksum" != "$checksum" ]; then
      echo "Refusing changed migration $version (stored checksum differs)." >&2
      exit 1
    fi
    echo "Already applied: $version"
    continue
  fi

  transaction_file="$(mktemp)"
  trap 'rm -f "$transaction_file"' EXIT INT TERM
  {
    printf '%s\n' 'BEGIN;'
    cat "$migration"
    printf "\nINSERT INTO ops_meta.schema_migrations(version, checksum) VALUES ('%s', '%s');\n" \
      "$version" "$checksum"
    printf '%s\n' 'COMMIT;'
  } > "$transaction_file"
  psql_safe -f "$transaction_file"
  rm -f "$transaction_file"
  trap - EXIT INT TERM
  echo "Applied: $version"
done

if [ "$found" != "true" ]; then
  echo "No SQL migrations found in $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "Database schema is current."
