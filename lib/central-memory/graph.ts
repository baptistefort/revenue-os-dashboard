import type { BrainEdge, BrainNode } from "@/lib/ops-demo-data";
import type { SqlQueryable } from "./database";
import { getCentralMemoryPool } from "./database";
import { resolveCentralMemoryOrganization } from "./search";

const GRAPH_NODE_LIMIT = 1_200;

type EntityGraphRow = {
  id: string;
  canonical_key: string;
  entity_type: string;
  display_name: string;
  summary: string | null;
  attributes: Record<string, unknown> | null;
  degree: number | string;
};

type RelationGraphRow = {
  subject_key: string;
  object_key: string;
  predicate: string;
};

function graphType(row: EntityGraphRow): BrainNode["type"] {
  const searchable = `${row.entity_type} ${row.display_name} ${row.summary ?? ""}`.toLocaleLowerCase("fr");
  if (row.entity_type === "organization") return "company";
  if (row.entity_type === "team-member" || row.entity_type === "contact") return "person";
  if (row.entity_type === "client") return "client";
  if (row.entity_type === "invoice" || row.entity_type === "payment") return "finance";
  if (row.entity_type === "decision") return "decision";
  if (row.entity_type === "document" && /(?:seo|google ads|meta ads|instagram|linkedin|acquisition)/.test(searchable)) {
    return "marketing";
  }
  if (row.entity_type === "document" || row.entity_type === "meeting" || row.entity_type === "email-thread") {
    return "document";
  }
  if (row.entity_type === "project" || row.entity_type === "opportunity" || row.entity_type === "task") {
    return "project";
  }
  return "knowledge";
}

function deterministicPosition(index: number, total: number, type: BrainNode["type"]) {
  const group = ["company", "person", "client", "project", "document", "finance", "marketing", "decision", "knowledge"].indexOf(type);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const radius = type === "company" ? 0 : 34 + Math.sqrt(index + 1) * Math.max(5.8, 420 / Math.sqrt(Math.max(total, 1)));
  const angle = index * golden + group * .37;
  return {
    x: Math.round(500 + Math.cos(angle) * radius),
    y: Math.round(360 + Math.sin(angle) * radius * .82),
  };
}

function edgeType(predicate: string): BrainEdge["type"] {
  if (/risk|late|blocked|overdue|depends/.test(predicate)) return "risk";
  if (/influence/.test(predicate)) return "influence";
  if (/documents|mentions|decided|creates|committed/.test(predicate)) return "knowledge";
  return "confirmed";
}

export async function buildCentralMemoryGraph(options: {
  queryable?: SqlQueryable;
  organizationSlug?: string;
  limit?: number;
} = {}) {
  const queryable = options.queryable ?? getCentralMemoryPool();
  const organization = await resolveCentralMemoryOrganization(queryable, options.organizationSlug);
  if (!organization) return { available: false, source: "central", nodes: [], edges: [] };
  const limit = Math.max(20, Math.min(GRAPH_NODE_LIMIT, options.limit ?? GRAPH_NODE_LIMIT));

  const entities = await queryable.query<EntityGraphRow>(`
    SELECT
      entities.id,
      entities.canonical_key,
      entities.entity_type,
      entities.display_name,
      entities.summary,
      entities.attributes,
      (
        SELECT count(*)
        FROM ops_memory.relations
        WHERE relations.organization_id = entities.organization_id
          AND relations.deleted_at IS NULL
          AND (relations.subject_entity_id = entities.id OR relations.object_entity_id = entities.id)
      )::int AS degree
    FROM ops_memory.entities
    WHERE entities.organization_id = $1
      AND entities.deleted_at IS NULL
    ORDER BY
      CASE entities.entity_type
        WHEN 'organization' THEN 0
        WHEN 'team-member' THEN 1
        WHEN 'client' THEN 2
        WHEN 'project' THEN 3
        WHEN 'opportunity' THEN 4
        WHEN 'decision' THEN 5
        WHEN 'document' THEN 6
        ELSE 7
      END,
      degree DESC,
      entities.last_seen_at DESC,
      entities.canonical_key
    LIMIT $2
  `, [organization.id, limit]);

  const selectedKeys = entities.rows.map((row) => row.canonical_key);
  if (!selectedKeys.length) return { available: false, source: "central", nodes: [], edges: [] };
  const relations = await queryable.query<RelationGraphRow>(`
    SELECT
      subject.canonical_key AS subject_key,
      object.canonical_key AS object_key,
      relations.predicate
    FROM ops_memory.relations
    JOIN ops_memory.entities subject ON subject.id = relations.subject_entity_id
    JOIN ops_memory.entities object ON object.id = relations.object_entity_id
    WHERE relations.organization_id = $1
      AND relations.deleted_at IS NULL
      AND subject.canonical_key = ANY($2::text[])
      AND object.canonical_key = ANY($2::text[])
    ORDER BY relations.observed_at DESC, relations.id
    LIMIT 5000
  `, [organization.id, selectedKeys]);

  const nodes: BrainNode[] = entities.rows.map((row, index) => {
    const type = graphType(row);
    const degree = Number(row.degree) || 0;
    const position = deterministicPosition(index, entities.rows.length, type);
    return {
      id: row.canonical_key,
      label: row.display_name,
      type,
      x: position.x,
      y: position.y,
      size: type === "company" ? 40 : 16 + Math.min(18, degree) * .45,
      summary: row.summary || `Élément relié de la mémoire ${row.display_name}.`,
      source: "central",
    };
  });
  const edgeKeys = new Set<string>();
  const edges: BrainEdge[] = [];
  for (const relation of relations.rows) {
    if (relation.subject_key === relation.object_key) continue;
    const key = `${relation.subject_key}::${relation.predicate}::${relation.object_key}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({
      from: relation.subject_key,
      to: relation.object_key,
      type: edgeType(relation.predicate),
    });
  }

  return {
    available: nodes.length > 3 && edges.length > 2,
    source: "central",
    nodes,
    edges,
  };
}
