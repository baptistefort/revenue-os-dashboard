#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/srv/ops}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SEED_DEMO="${SEED_DEMO:-auto}"
APP_UID="${APP_UID:-1001}"
APP_GID="${APP_GID:-1001}"
OPENCODE_GID="${OPENCODE_GID:-1002}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-$(dirname "$APP_DIR")/ops-deploy-state}"
BACKUP_ROOT="${BACKUP_ROOT:-$(dirname "$APP_DIR")/ops-backups}"
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
EXPECTED_VAULT_ROOT_NAME="${EXPECTED_VAULT_ROOT_NAME:-OPS Demo — Atelier Beaumarchais}"
VAULT_MIGRATION_MODE="${VAULT_MIGRATION_MODE:-reject}"
APP_IMAGE="${APP_IMAGE:-ops-web:latest}"
OPENCODE_IMAGE="${OPENCODE_IMAGE:-ops-opencode:1.18.2}"

for numeric_id in "$APP_UID" "$APP_GID" "$OPENCODE_GID"; do
  if [[ ! "$numeric_id" =~ ^[0-9]+$ ]]; then
    echo "APP_UID, APP_GID and OPENCODE_GID must be numeric." >&2
    exit 1
  fi
done

if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{8,80}$ ]]; then
  echo "RELEASE_ID may only contain letters, digits, dot, underscore and dash." >&2
  exit 1
fi

if [[ ! "$SEED_DEMO" =~ ^(auto|always|never)$ ]]; then
  echo "SEED_DEMO must be auto, always or never." >&2
  exit 1
fi

if [[ ! "$VAULT_MIGRATION_MODE" =~ ^(reject|allow-existing)$ ]]; then
  echo "VAULT_MIGRATION_MODE must be reject or allow-existing." >&2
  exit 1
fi

umask 077
mkdir -p "$DEPLOY_STATE_DIR/releases" "$BACKUP_ROOT"
chmod 700 "$DEPLOY_STATE_DIR" "$DEPLOY_STATE_DIR/releases" "$BACKUP_ROOT"
exec 9>"$DEPLOY_STATE_DIR/deploy.lock"
if ! flock -n 9; then
  echo "Another OPS deployment is already running." >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f .env.production ]]; then
  echo "Missing $APP_DIR/.env.production" >&2
  exit 1
fi
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $APP_DIR/$COMPOSE_FILE" >&2
  exit 1
fi

chmod 600 .env.production
docker network inspect sags-os_default >/dev/null
docker compose -f "$COMPOSE_FILE" config --quiet

BACKUP_DIR="$BACKUP_ROOT/$RELEASE_ID"
RELEASE_FILE="$DEPLOY_STATE_DIR/releases/$RELEASE_ID.env"
if [[ -e "$BACKUP_DIR" || -e "$RELEASE_FILE" ]]; then
  echo "Release $RELEASE_ID already exists; choose another RELEASE_ID." >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

mkdir -p data/obsidian data/documents

source_revision="unmanaged-source"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  source_revision="$(git rev-parse HEAD)"
fi
source_fingerprint="$({
  find . -type f \
    ! -path './.git/*' \
    ! -path './.next/*' \
    ! -path './data/*' \
    ! -path './node_modules/*' \
    ! -path './.env.production' \
    -print0 \
    | sort -z \
    | xargs -0 sha256sum
} | sha256sum | awk '{print $1}')"

previous_app_image=""
previous_opencode_image=""
app_rollback_tag="ops-web:rollback-$RELEASE_ID"
opencode_rollback_tag="ops-opencode:rollback-$RELEASE_ID"

if previous_app_image="$(docker image inspect --format '{{.Id}}' "$APP_IMAGE" 2>/dev/null)"; then
  :
else
  previous_app_image=""
  app_rollback_tag=""
fi
if previous_opencode_image="$(docker image inspect --format '{{.Id}}' "$OPENCODE_IMAGE" 2>/dev/null)"; then
  :
else
  previous_opencode_image=""
  opencode_rollback_tag=""
fi

# This is the last point before any permission, seed, image or container change.
# The archive and config copies make rollback independent from Git: /srv/ops is
# deliberately allowed to be a plain uploaded directory.
tar -C "$APP_DIR" -czf "$BACKUP_DIR/data.tar.gz" data
chmod 600 "$BACKUP_DIR/data.tar.gz"
cp -p .env.production "$BACKUP_DIR/.env.production"
cp -p "$COMPOSE_FILE" "$BACKUP_DIR/$COMPOSE_FILE"
chmod 600 "$BACKUP_DIR/.env.production" "$BACKUP_DIR/$COMPOSE_FILE"

write_release_metadata() {
  local status="$1"
  local temporary="$RELEASE_FILE.tmp"
  {
    printf 'release_id=%q\n' "$RELEASE_ID"
    printf 'created_at=%q\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'status=%q\n' "$status"
    printf 'app_dir=%q\n' "$APP_DIR"
    printf 'compose_file=%q\n' "$COMPOSE_FILE"
    printf 'backup_dir=%q\n' "$BACKUP_DIR"
    printf 'source_revision=%q\n' "$source_revision"
    printf 'source_fingerprint=%q\n' "$source_fingerprint"
    printf 'previous_app_image=%q\n' "$previous_app_image"
    printf 'previous_opencode_image=%q\n' "$previous_opencode_image"
    printf 'app_rollback_tag=%q\n' "$app_rollback_tag"
    printf 'opencode_rollback_tag=%q\n' "$opencode_rollback_tag"
  } > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$RELEASE_FILE"
}

deployment_failed() {
  local exit_code=$?
  trap - ERR
  write_release_metadata "failed"
  echo >&2
  echo "OPS release $RELEASE_ID failed. Persistent data backup: $BACKUP_DIR" >&2
  echo "No automatic data restore was attempted. Follow deploy/README.md to roll back safely." >&2
  exit "$exit_code"
}
trap deployment_failed ERR
write_release_metadata "deploying"

[[ -n "$app_rollback_tag" ]] && docker image tag "$APP_IMAGE" "$app_rollback_tag"
[[ -n "$opencode_rollback_tag" ]] && docker image tag "$OPENCODE_IMAGE" "$opencode_rollback_tag"

normalize_writable_data_permissions() {
  # The Next.js process owns all mutable business data. OpenCode only receives
  # a read-only bind mount and shares the vault group for seed compatibility.
  chown -R "$APP_UID:$OPENCODE_GID" data/obsidian
  find data/obsidian -type d -exec chmod 2770 {} +
  find data/obsidian -type f -exec chmod 660 {} +

  chown -R "$APP_UID:$APP_GID" data/documents
  find data/documents -type d -exec chmod 750 {} +
  find data/documents -type f -exec chmod 640 {} +
}

validate_vault_layout() {
  [[ -z "$EXPECTED_VAULT_ROOT_NAME" ]] && return 0
  local expected="data/obsidian/$EXPECTED_VAULT_ROOT_NAME"
  local unexpected_file=""
  unexpected_file="$(find data/obsidian -type f -name '*.md' \
    ! -path "$expected/*" -print -quit)"
  if [[ -n "$unexpected_file" && "$VAULT_MIGRATION_MODE" != "allow-existing" ]]; then
    cat >&2 <<EOF
Refusing to mix an existing vault with the expected demo vault.
Unexpected Markdown file: $unexpected_file
Expected vault root: $expected
The untouched pre-deploy data is archived in: $BACKUP_DIR/data.tar.gz

Move/restore the intended vault explicitly, or rerun with
VAULT_MIGRATION_MODE=allow-existing only after verifying that indexing both
roots is intentional. The deploy script never deletes or silently migrates a vault.
EOF
    return 1
  fi
}

validate_vault_layout
chmod 750 data
normalize_writable_data_permissions

docker compose -f "$COMPOSE_FILE" build --pull

if [[ "$SEED_DEMO" == "always" ]] \
  || { [[ "$SEED_DEMO" == "auto" ]] && ! find data/obsidian -type f -name '*.md' -print -quit | grep -q .; }; then
  docker compose -f "$COMPOSE_FILE" --profile tools run --rm vault-seed
fi

normalize_writable_data_permissions

docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose -f "$COMPOSE_FILE" ps

# The shallow liveness endpoint keeps Docker restart semantics independent from
# its dependencies. Cutover, however, succeeds only when the authenticated
# OpenCode service and both persistent stores pass deep readiness.
readiness_ok="false"
for _attempt in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T app node -e \
    "fetch('http://127.0.0.1:3000/api/readiness',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok||b.status!=='ready')process.exit(1)}).catch(()=>process.exit(1))"; then
    readiness_ok="true"
    break
  fi
  sleep 2
done
if [[ "$readiness_ok" != "true" ]]; then
  echo "OPS deep readiness did not become ready within 60 seconds." >&2
  false
fi

write_release_metadata "ready"
ln -sfn "releases/$RELEASE_ID.env" "$DEPLOY_STATE_DIR/current.env"
printf '%s\n' "$RELEASE_ID" > "$DEPLOY_STATE_DIR/last-successful-release"
chmod 600 "$DEPLOY_STATE_DIR/last-successful-release"
trap - ERR

echo
echo "OPS release $RELEASE_ID is ready."
echo "Release metadata: $RELEASE_FILE"
echo "Rollback backup: $BACKUP_DIR"
echo "Reload the existing Caddy service only when its configuration changed."
