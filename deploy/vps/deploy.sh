#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/srv/ops}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SEED_DEMO="${SEED_DEMO:-auto}"

cd "$APP_DIR"

if [[ ! -f .env.production ]]; then
  echo "Missing $APP_DIR/.env.production" >&2
  exit 1
fi

chmod 600 .env.production
mkdir -p data/obsidian data/documents
chown -R 1001:1001 data/documents
chmod 750 data data/documents
chown -R 1002:1002 data/obsidian
find data/obsidian -type d -exec chmod 755 {} +
find data/obsidian -type f -exec chmod 644 {} +

docker network inspect sags-os_default >/dev/null

docker compose -f "$COMPOSE_FILE" config --quiet
docker compose -f "$COMPOSE_FILE" build --pull

if [[ "$SEED_DEMO" == "always" ]] \
  || { [[ "$SEED_DEMO" == "auto" ]] && ! find data/obsidian -type f -name '*.md' -print -quit | grep -q .; }; then
  docker compose -f "$COMPOSE_FILE" --profile tools run --rm vault-seed
fi

docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose -f "$COMPOSE_FILE" ps

echo
echo "OPS containers are running."
echo "Reload the existing Caddy service after adding deploy/caddy/ops.caddy."
