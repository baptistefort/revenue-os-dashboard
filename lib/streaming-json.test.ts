import assert from "node:assert/strict";
import test from "node:test";
import { StreamingJsonStringField } from "@/lib/streaming-json";

test("streams a JSON answer field without waiting for the full object", () => {
  const parser = new StreamingJsonStringField("answer");
  assert.equal(parser.push('{"answer":"Bon'), "Bon");
  assert.equal(parser.push("jour Marie"), "jour Marie");
  assert.equal(parser.push('","sources":[]'), "");
  assert.equal(parser.value, "Bonjour Marie");
});

test("waits for complete escape sequences", () => {
  const parser = new StreamingJsonStringField("answer");
  assert.equal(parser.push('{"answer":"Ligne 1\\'), "Ligne 1");
  assert.equal(parser.push('nLigne 2 \\u00'), "\nLigne 2 ");
  assert.equal(parser.push('e9."}'), "é.");
  assert.equal(parser.value, "Ligne 1\nLigne 2 é.");
});

test("ignores fields that precede answer", () => {
  const parser = new StreamingJsonStringField("answer");
  assert.equal(parser.push('{"kicker":"Test","answer"'), "");
  assert.equal(parser.push(' : "Décision'), "Décision");
  assert.equal(parser.push(' prise"}'), " prise");
});
