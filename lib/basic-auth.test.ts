import assert from "node:assert/strict";
import test from "node:test";
import { authorizeBasicHeader } from "@/lib/basic-auth";

const username = "ops";
const password = "AtelierOPS-2026-7K9m2Qx4";
const header = (value: string) => `Basic ${Buffer.from(value).toString("base64")}`;

test("l'accès OPS accepte uniquement la paire Basic exacte", () => {
  assert.equal(authorizeBasicHeader(header(`${username}:${password}`), username, password), true);
  assert.equal(authorizeBasicHeader(header(`${username}:incorrect`), username, password), false);
  assert.equal(authorizeBasicHeader(header(`autre:${password}`), username, password), false);
  assert.equal(authorizeBasicHeader(null, username, password), false);
  assert.equal(authorizeBasicHeader("Bearer public", username, password), false);
});

test("un mot de passe peut contenir des deux-points sans ambiguïté", () => {
  assert.equal(authorizeBasicHeader(header("ops:secret:interne"), "ops", "secret:interne"), true);
});
