#!/bin/sh
set -eu

SEEDS_DIR="${SEEDS_DIR:-/seeds}"
DATABASE_URL="${DATABASE_URL:-}"

if [ "${OPS_SEED_DATABASE:-deny}" != "allow" ]; then
  echo "Database seed is disabled. Set OPS_SEED_DATABASE=allow explicitly." >&2
  exit 1
fi
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required for database seed." >&2
  exit 1
fi
if [ ! -d "$SEEDS_DIR" ]; then
  echo "Seed directory not found: $SEEDS_DIR" >&2
  exit 1
fi

psql_safe() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"
}

psql_safe <<'SQL'
CREATE SCHEMA IF NOT EXISTS ops_meta;
CREATE TABLE IF NOT EXISTS ops_meta.seed_runs (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

for seed in "$SEEDS_DIR"/*.sql; do
  [ -f "$seed" ] || continue
  version="$(basename "$seed")"
  case "$version" in
    *[!A-Za-z0-9._-]*)
      echo "Unsafe seed filename: $version" >&2
      exit 1
      ;;
  esac
  checksum="$(sha256sum "$seed" | awk '{print $1}')"
  applied_checksum="$(psql_safe -Atqc "SELECT checksum FROM ops_meta.seed_runs WHERE version = '$version'")"
  if [ -n "$applied_checksum" ]; then
    if [ "$applied_checksum" != "$checksum" ]; then
      echo "Refusing changed seed $version (stored checksum differs)." >&2
      exit 1
    fi
    echo "Already seeded: $version"
    continue
  fi

  transaction_file="$(mktemp)"
  trap 'rm -f "$transaction_file"' EXIT INT TERM
  {
    printf '%s\n' 'BEGIN;'
    cat "$seed"
    printf "\nINSERT INTO ops_meta.seed_runs(version, checksum) VALUES ('%s', '%s');\n" \
      "$version" "$checksum"
    printf '%s\n' 'COMMIT;'
  } > "$transaction_file"
  psql_safe -f "$transaction_file"
  rm -f "$transaction_file"
  trap - EXIT INT TERM
  echo "Seeded: $version"
done
