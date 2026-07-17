import type { SqlQueryable } from "./database";
import { getCentralMemoryPool } from "./database";
import { centralMemoryConfigured } from "./search";

const DEFAULT_ORGANIZATION_SLUG = "atelier-beaumarchais";
const MAX_VERIFIED_SOURCES = 20;
const MAX_SOURCE_LENGTH = 240;

type CentralSourceMatchRow = {
  requested_lookup: string;
};

export type VerifyAgentSourcesOptions = {
  queryable?: SqlQueryable;
  organizationSlug?: string;
  centralEnabled?: boolean;
  hasObsidianSource?: (lookup: string) => boolean | Promise<boolean>;
  maxSources?: number;
};

type SourceCandidate = {
  original: string;
  lookup: string;
  normalizedLookup: string;
};

function lookupValue(source: string) {
  return source.trim().replace(/#.+$/, "");
}

function sourceCandidates(sources: string[]) {
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (typeof source !== "string" || source.includes("\0")) continue;
    const original = source.trim();
    if (!original || original.length > MAX_SOURCE_LENGTH) continue;
    const lookup = lookupValue(original);
    if (!lookup) continue;
    const normalizedLookup = lookup.toLocaleUpperCase("fr");
    if (seen.has(normalizedLookup)) continue;
    seen.add(normalizedLookup);
    candidates.push({ original, lookup, normalizedLookup });
  }

  return candidates;
}

/**
 * Resolves every source identifier in one tenant-scoped PostgreSQL query.
 * Source objects are authoritative, including intentionally unprojected raw
 * records such as email-message objects.
 */
export async function findCentralSourceLookups(options: {
  lookups: string[];
  queryable?: SqlQueryable;
  organizationSlug?: string;
  centralEnabled?: boolean;
}) {
  const uniqueLookups = [...new Set(options.lookups
    .map((lookup) => lookup.trim().toLocaleUpperCase("fr"))
    .filter(Boolean))];
  if (!uniqueLookups.length) return new Set<string>();

  const enabled = options.centralEnabled
    ?? Boolean(options.queryable || centralMemoryConfigured());
  if (!enabled) return new Set<string>();

  const queryable = options.queryable ?? getCentralMemoryPool();
  const organizationSlug = options.organizationSlug?.trim()
    || process.env.OPS_ORGANIZATION_SLUG?.trim()
    || DEFAULT_ORGANIZATION_SLUG;
  const result = await queryable.query<CentralSourceMatchRow>(`
    WITH requested AS (
      SELECT DISTINCT upper(trim(value)) AS requested_lookup
      FROM unnest($2::text[]) AS input(value)
      WHERE trim(value) <> ''
    )
    SELECT requested.requested_lookup
    FROM requested
    JOIN ops_memory.organizations organization
      ON organization.slug = $1
      AND organization.deleted_at IS NULL
    WHERE EXISTS (
      SELECT 1
      FROM ops_memory.source_objects source
      WHERE source.organization_id = organization.id
        AND source.is_current = true
        AND source.deleted_at IS NULL
        AND source.source_deleted_at IS NULL
        AND requested.requested_lookup = ANY(ARRAY[
          upper(source.source_id),
          upper(COALESCE(source.content_json->>'id', '')),
          upper(COALESCE(source.metadata->>'externalId', ''))
        ])
    )
  `, [organizationSlug, uniqueLookups]);

  return new Set(result.rows.map((row) => row.requested_lookup.toLocaleUpperCase("fr")));
}

/**
 * Keeps model order, deduplicates case-insensitively and caps the public list.
 * PostgreSQL is checked first in bulk; only unmatched identifiers are looked
 * up in the in-memory Obsidian index for backward compatibility.
 */
export async function verifyAgentSourceList(
  sources: string[],
  options: VerifyAgentSourcesOptions = {},
) {
  const candidates = sourceCandidates(sources);
  if (!candidates.length) return [];

  let centralMatches = new Set<string>();
  try {
    centralMatches = await findCentralSourceLookups({
      lookups: candidates.map((candidate) => candidate.lookup),
      queryable: options.queryable,
      organizationSlug: options.organizationSlug,
      centralEnabled: options.centralEnabled,
    });
  } catch (error) {
    // Obsidian remains a compatibility fallback when PostgreSQL is temporarily
    // unavailable; it never overrides a central match.
    console.error("[OPS] Central source verification unavailable; using Obsidian fallback.", error);
  }

  const verified: string[] = [];
  const limit = Math.min(
    MAX_VERIFIED_SOURCES,
    Math.max(1, options.maxSources ?? MAX_VERIFIED_SOURCES),
  );
  for (const candidate of candidates) {
    if (centralMatches.has(candidate.normalizedLookup)) {
      verified.push(candidate.original);
    } else if (options.hasObsidianSource && await options.hasObsidianSource(candidate.lookup)) {
      verified.push(candidate.original);
    }
    if (verified.length >= limit) break;
  }

  return verified;
}

