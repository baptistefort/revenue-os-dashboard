import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import {
  centralMemoryRequestedDays,
  searchCentralMemory,
  type CentralMemorySearchRecord,
} from "@/lib/central-memory/search";
import type { SqlQueryable } from "@/lib/central-memory/database";

test("relative date extraction follows the configured business date", () => {
  const previous = process.env.OPS_BUSINESS_DATE;
  process.env.OPS_BUSINESS_DATE = "2026-07-17";
  try {
    assert.deepEqual(centralMemoryRequestedDays("Compare le SEO d'hier à aujourd'hui"), [
      "2026-07-16",
      "2026-07-17",
    ]);
    assert.deepEqual(centralMemoryRequestedDays("Analyse avant-hier"), ["2026-07-15"]);
    assert.deepEqual(
      centralMemoryRequestedDays("Compare le SEO du 16 juillet 2026 à la veille"),
      ["2026-07-15", "2026-07-16"],
    );
    assert.deepEqual(
      centralMemoryRequestedDays("Compare 2026-07-16 au jour d'avant"),
      ["2026-07-15", "2026-07-16"],
    );
  } finally {
    if (previous === undefined) delete process.env.OPS_BUSINESS_DATE;
    else process.env.OPS_BUSINESS_DATE = previous;
  }
});

test("central search expands a SEO question and retains the exact day", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const queryable: SqlQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>> {
      calls.push({ text, values });
      if (text.includes("FROM ops_memory.organizations")) {
        return { rows: [{ id: "org-1", slug: "atelier-beaumarchais", display_name: "Atelier Beaumarchais" }], rowCount: 1, command: "SELECT", oid: 0, fields: [] } as unknown as QueryResult<Row>;
      }
      return {
        rows: [{
          row_id: "row-1",
          business_id: "SEO-SNAPSHOT-20260716",
          source_id: "reference_SEO-SNAPSHOT-20260716",
          object_type: "document",
          title: "Snapshot SEO · 16 juillet 2026",
          content_text: "4 790 impressions, 192 clics, CTR 4,13 %.",
          content_json: { id: "SEO-SNAPSHOT-20260716", periodEnd: "2026-07-16" },
          metadata: { confidentiality: "internal" },
          source_type: "drive",
          source_url: null,
          source_updated_at: "2026-07-16T23:45:00.000Z",
          score: 142,
        }],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      } as unknown as QueryResult<Row>;
    },
  };
  const previous = process.env.OPS_BUSINESS_DATE;
  process.env.OPS_BUSINESS_DATE = "2026-07-17";
  try {
    const results = await searchCentralMemory({
      query: "Quel est le récap SEO d'hier ?",
      queryable,
    });
    assert.equal(results.length, 1);
    assert.equal((results[0] as CentralMemorySearchRecord).id, "SEO-SNAPSHOT-20260716");
    const values = calls.at(-1)?.values ?? [];
    assert.ok((values[2] as string[]).some((pattern) => pattern.includes("search console")));
    assert.deepEqual(values[3], ["2026-07-16"]);
    assert.ok((values[5] as string[]).includes("metric"));
  } finally {
    if (previous === undefined) delete process.env.OPS_BUSINESS_DATE;
    else process.env.OPS_BUSINESS_DATE = previous;
  }
});

test("a contextual follow-up inherits its business topic", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const queryable: SqlQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>> {
      calls.push({ text, values });
      return (text.includes("FROM ops_memory.organizations")
        ? { rows: [{ id: "org-1", slug: "atelier-beaumarchais", display_name: "Atelier" }], rowCount: 1, command: "SELECT", oid: 0, fields: [] }
        : { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] }) as unknown as QueryResult<Row>;
    },
  };
  await searchCentralMemory({
    query: "Et par rapport à hier ?",
    history: [{ role: "user", content: "Analyse les performances Google Ads" }],
    queryable,
  });
  const values = calls.at(-1)?.values ?? [];
  assert.ok((values[2] as string[]).some((pattern) => pattern.includes("google-ads")));
  assert.ok((values[5] as string[]).includes("opportunity"));
});
