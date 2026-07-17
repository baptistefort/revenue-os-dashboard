import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { SqlQueryable } from "./database";
import { verifyAgentSourceList } from "./source-verification";

function centralQueryable(matches: string[]) {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const queryable: SqlQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>> {
      calls.push({ text, values });
      return {
        rows: matches.map((requested_lookup) => ({ requested_lookup })) as unknown as Row[],
        rowCount: matches.length,
        command: "SELECT",
        oid: 0,
        fields: [],
      };
    },
  };
  return { queryable, calls };
}

test("a raw central email source is verified even when it is absent from Obsidian", async () => {
  const { queryable, calls } = centralQueryable(["EML-20260716-0042"]);
  const obsidianLookups: string[] = [];

  const verified = await verifyAgentSourceList([
    "EML-20260716-0042",
    "EML-20260716-0042",
  ], {
    queryable,
    organizationSlug: "atelier-beaumarchais",
    hasObsidianSource: (lookup) => {
      obsidianLookups.push(lookup);
      return false;
    },
  });

  assert.deepEqual(verified, ["EML-20260716-0042"]);
  assert.deepEqual(obsidianLookups, []);
  assert.equal(calls.length, 1, "central verification must stay bulk and avoid N+1 queries");
  assert.match(calls[0].text, /source\.organization_id = organization\.id/);
  assert.match(calls[0].text, /organization\.slug = \$1/);
  assert.deepEqual(calls[0].values, ["atelier-beaumarchais", ["EML-20260716-0042"]]);
});

test("an unmatched central identifier can fall back to the Obsidian index", async () => {
  const { queryable, calls } = centralQueryable([]);

  const verified = await verifyAgentSourceList([
    "Clients/Vitreflam.md#Décisions",
  ], {
    queryable,
    hasObsidianSource: (lookup) => lookup === "Clients/Vitreflam.md",
  });

  assert.deepEqual(verified, ["Clients/Vitreflam.md#Décisions"]);
  assert.equal(calls.length, 1);
});

test("an identifier absent from both memories is rejected", async () => {
  const { queryable, calls } = centralQueryable([]);

  const verified = await verifyAgentSourceList([
    "UNKNOWN-999",
    "\0FORBIDDEN-001",
  ], {
    queryable,
    hasObsidianSource: () => false,
  });

  assert.deepEqual(verified, []);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values?.[1], ["UNKNOWN-999"]);
});

test("source verification preserves first-seen order and caps output at twenty", async () => {
  const sources = Array.from({ length: 25 }, (_, index) => `SRC-${String(index + 1).padStart(2, "0")}`);
  const { queryable } = centralQueryable(sources.map((source) => source.toUpperCase()));

  const verified = await verifyAgentSourceList(sources, { queryable });

  assert.deepEqual(verified, sources.slice(0, 20));
});
