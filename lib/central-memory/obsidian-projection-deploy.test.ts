import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

test("the tool image contains the central projector and its TypeScript alias config", () => {
  const dockerfile = readFileSync(path.join(projectRoot, "deploy/opencode/Dockerfile"), "utf8");
  assert.match(dockerfile, /COPY[^\n]+tsconfig\.json/);
  assert.match(dockerfile, /COPY[^\n]+scripts\/project-central-memory\.ts/);
});

test("the projection tool is isolated but can reach PostgreSQL and write the vault", () => {
  const compose = readFileSync(path.join(projectRoot, "docker-compose.prod.yml"), "utf8");
  const start = compose.indexOf("\n  central-memory-project:\n");
  const end = compose.indexOf("\nnetworks:\n", start);
  assert.ok(start >= 0 && end > start, "central-memory-project service is missing");
  const service = compose.slice(start, end);
  assert.match(service, /profiles:\s*\n\s*- tools/);
  assert.match(service, /user: "1001:1002"/);
  assert.match(service, /read_only: true/);
  assert.match(service, /database-migrate:/);
  assert.match(
    service,
    /OBSIDIAN_VAULT_PATH: ["']?\/data\/obsidian\/OPS — Atelier Beaumarchais["']?/,
  );
  assert.match(service, /\.\/data\/obsidian:\/data\/obsidian(?:\s|$)/);
  assert.match(service, /- ops_private/);
  assert.match(service, /cap_drop:\s*\n\s*- ALL/);
  assert.doesNotMatch(service, /ports:/);
});

test("deploy backs up, seeds, projects, normalizes permissions, then cuts over", () => {
  const deploy = readFileSync(path.join(projectRoot, "deploy/vps/deploy.sh"), "utf8");
  const backup = deploy.indexOf('tar -C "$APP_DIR" -czf "$BACKUP_DIR/data.tar.gz" data');
  const seed = deploy.indexOf("run --rm central-memory-seed");
  const projection = deploy.indexOf("run --rm central-memory-project");
  const cutover = deploy.indexOf("up -d --remove-orphans");
  assert.ok(backup >= 0 && backup < seed);
  assert.ok(seed < projection);
  assert.ok(projection < cutover);
  assert.match(deploy.slice(projection, cutover), /normalize_writable_data_permissions/);
});
