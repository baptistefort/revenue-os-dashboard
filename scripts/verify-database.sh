#!/bin/sh
set -eu

DATABASE_URL="${DATABASE_URL:-}"
VERIFICATION_FILE="${VERIFICATION_FILE:-database/verification/central_memory_invariants.sql}"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required for database verification." >&2
  exit 1
fi
if [ ! -f "$VERIFICATION_FILE" ]; then
  echo "Verification SQL not found: $VERIFICATION_FILE" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$VERIFICATION_FILE"
echo "Central memory invariants verified."
