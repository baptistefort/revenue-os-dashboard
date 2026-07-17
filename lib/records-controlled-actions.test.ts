import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/records/route.ts", import.meta.url);

test("POST /api/records passe par l'exécuteur contrôlé et retourne son reçu", async () => {
  const source = await readFile(routeUrl, "utf8");
  const post = source.slice(source.indexOf("export async function POST"));
  assert.match(post, /executeControlledOpsAction\(action/);
  assert.match(post, /receipt:\s*result\.receipt/);
  assert.match(post, /idempotency-key/);
  assert.match(post, /status:\s*parsed\.status/);
  assert.match(post, /dayIndex:\s*parsed\.dayIndex/);
  assert.match(post, /weekOffset:\s*parsed\.weekOffset/);
  assert.doesNotMatch(post, /Email de démonstration envoyé/);
});

test("PATCH /api/records journalise la mutation dans la mémoire centrale", async () => {
  const source = await readFile(routeUrl, "utf8");
  const patch = source.slice(
    source.indexOf("export async function PATCH"),
    source.indexOf("export async function POST"),
  );
  assert.match(patch, /mirrorControlledRecordMutation/);
  assert.match(patch, /requestedBy:\s*"marie-delmas"/);
  assert.match(patch, /idempotency-key/);
  assert.match(patch, /controlled_receipt_required/);
  assert.match(patch, /delivery_receipt/);
  assert.match(patch, /readCentralUiRecordById/);
  assert.match(patch, /projection:\s*"pending_retry"/);
  assert.ok(
    patch.indexOf("mirrorControlledRecordMutation({")
      < patch.indexOf("persistRecordProjection(hasExistingProjection"),
    "la transaction centrale doit précéder la projection Obsidian",
  );
  assert.doesNotMatch(patch, /Email de démonstration envoyé/);
});

test("PATCH reconnaît les identifiants centraux CLT et TSK sans note legacy", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /\^\(\?:TASK\|TSK\)-/);
  assert.match(source, /\^\(\?:CLI\|CLIENT\|CLT\)-/);
  assert.match(source, /centralRecordAsObsidian/);
});
