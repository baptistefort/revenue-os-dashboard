import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { SqlQueryable } from "@/lib/central-memory/database";
import { buildCentralMemoryGraph } from "@/lib/central-memory/graph";

test("the central graph stays tenant-scoped and maps durable business types", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const queryable: SqlQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> {
      calls.push({ sql, values });
      if (sql.includes("FROM ops_memory.organizations")) {
        return { rows: [{ id: "org-1", slug: "atelier-beaumarchais", display_name: "Atelier" }], rowCount: 1, command: "SELECT", oid: 0, fields: [] } as unknown as QueryResult<Row>;
      }
      if (sql.includes("FROM ops_memory.entities") && !sql.includes("JOIN ops_memory.entities")) {
        return { rows: [
          { id: "e1", canonical_key: "ORG-ATELIER-BEAUMARCHAIS", entity_type: "organization", display_name: "Atelier Beaumarchais", summary: "Mémoire", attributes: {}, degree: 3 },
          { id: "e2", canonical_key: "CLT-VITREFLAM", entity_type: "client", display_name: "Vitreflam", summary: "Client", attributes: {}, degree: 2 },
          { id: "e3", canonical_key: "PER-FABIEN", entity_type: "contact", display_name: "Fabien", summary: "Dirigeant", attributes: {}, degree: 2 },
          { id: "e4", canonical_key: "SEO-SNAPSHOT-20260716", entity_type: "document", display_name: "Snapshot SEO", summary: "SEO", attributes: {}, degree: 1 },
        ], rowCount: 4, command: "SELECT", oid: 0, fields: [] } as unknown as QueryResult<Row>;
      }
      return { rows: [
        { subject_key: "PER-FABIEN", object_key: "CLT-VITREFLAM", predicate: "works-at" },
        { subject_key: "SEO-SNAPSHOT-20260716", object_key: "ORG-ATELIER-BEAUMARCHAIS", predicate: "documents" },
        { subject_key: "CLT-VITREFLAM", object_key: "ORG-ATELIER-BEAUMARCHAIS", predicate: "concerns" },
      ], rowCount: 3, command: "SELECT", oid: 0, fields: [] } as unknown as QueryResult<Row>;
    },
  };
  const graph = await buildCentralMemoryGraph({ queryable });
  assert.equal(graph.available, true);
  assert.equal(graph.nodes.find((node) => node.id === "SEO-SNAPSHOT-20260716")?.type, "marketing");
  assert.equal(graph.nodes.find((node) => node.id === "PER-FABIEN")?.type, "person");
  assert.equal(graph.edges.length, 3);
  assert.ok(calls.every((call) => !call.sql.includes("SELECT *")));
  assert.equal(calls[1]?.values?.[0], "org-1");
});
