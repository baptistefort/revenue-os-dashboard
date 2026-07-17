import type { OpsCompanyState, OpsCompanyStateSource } from "../ops-company-state";
import type { SqlQueryable } from "./database";
import { getCentralMemoryPool } from "./database";
import { resolveCentralMemoryOrganization } from "./search";

const METRIC_KEYS = [
  "finance.revenue",
  "finance.gross_margin",
  "finance.cash_visibility",
  "finance.outstanding_receivables",
  "crm.open_pipeline",
  "crm.weighted_pipeline",
  "crm.open_opportunities",
  "crm.conversion_rate_90d",
  "operations.workshop_load_percent",
  "operations.available_capacity_days",
  "operations.projects_at_risk",
  "operations.sensitive_deadlines",
  "seo.clicks",
  "seo.impressions",
  "seo.ctr",
  "seo.average_position",
  "seo.keyword_clicks_menuiserie_paris",
  "seo.conversions",
  "google-ads.spend",
  "google-ads.clicks",
  "google-ads.qualified_leads",
  "google-ads.pipeline",
  "google-ads.conversions",
  "meta-ads.spend",
  "meta-ads.qualified_leads",
  "meta-ads.pipeline",
  "instagram.spend",
  "instagram.views",
  "instagram.saves",
  "instagram.opportunities",
  "instagram.qualified_leads",
  "instagram.pipeline",
  "linkedin.spend",
  "linkedin.qualified_leads",
  "linkedin.pipeline",
] as const;

type MetricRow = {
  metric_key: string;
  value: string | number;
  unit: string | null;
  dimensions: Record<string, unknown> | null;
  observed_at: string | Date;
  period_start: string | Date | null;
  period_end: string | Date | null;
  granularity: string;
  external_id: string | null;
  source_id: string | null;
  source_title: string | null;
  source_content: string | null;
  source_url: string | null;
  source_updated_at: string | Date | null;
};

type ReceivablesRow = {
  actionable_receivables: string | number | null;
};

type ChannelRow = {
  instagram_opportunities: string | number | null;
};

type MemoryCountsRow = {
  indexed_at: string | Date | null;
  entity_count: string | number;
  source_count: string | number;
};

export type BuildCentralCompanyStateOptions = {
  queryable?: SqlQueryable;
  organizationSlug?: string;
  businessDate?: string;
  now?: Date;
};

function currentParisDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Paris",
  }).format(now);
}

function configuredBusinessDate(now?: Date) {
  const configured = process.env.OPS_BUSINESS_DATE?.trim();
  return configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)
    ? configured
    : currentParisDate(now);
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function iso(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value: string | Date | null | undefined) {
  return iso(value)?.slice(0, 10) ?? null;
}

function monthWindow(value: string | Date | null | undefined) {
  const period = dateOnly(value);
  if (!period) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period.slice(0, 7)}-01T00:00:00.000Z`));
}

function sourceFor(rows: MetricRow[], domain: string, title: string): OpsCompanyStateSource | null {
  const candidates = rows.filter((row) => row.metric_key.startsWith(`${domain}.`));
  const row = candidates[0];
  if (!row) return null;
  const id = row.external_id || row.source_id || row.metric_key;
  const period = dateOnly(row.period_end);
  const values = candidates
    .slice(0, 6)
    .map((metric) => `${metric.metric_key.split(".").slice(1).join(".")} : ${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`)
    .join(" · ");
  return {
    id,
    title,
    summary: row.source_content || values,
    path: row.source_url || `central://metrics/${encodeURIComponent(id)}`,
    period,
    updatedAt: iso(row.source_updated_at) || iso(row.observed_at) || new Date(0).toISOString(),
  };
}

function metricMap(rows: MetricRow[]) {
  return new Map(rows.map((row) => [row.metric_key, finiteNumber(row.value)]));
}

function valueFor(metrics: Map<string, number | null>, key: string) {
  return metrics.get(key) ?? null;
}

function sumMetrics(metrics: Map<string, number | null>, keys: string[]) {
  const values = keys
    .map((key) => valueFor(metrics, key))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Builds the web application's operational snapshot from the tenant-scoped
 * PostgreSQL memory. Values are never duplicated in application code: every
 * number comes from a current metric or source object and keeps a source id.
 */
export async function buildCentralCompanyState(
  options: BuildCentralCompanyStateOptions = {},
): Promise<OpsCompanyState | null> {
  const queryable = options.queryable ?? getCentralMemoryPool();
  const organization = await resolveCentralMemoryOrganization(
    queryable,
    options.organizationSlug,
  );
  if (!organization) return null;

  const businessDate = options.businessDate && /^\d{4}-\d{2}-\d{2}$/.test(options.businessDate)
    ? options.businessDate
    : configuredBusinessDate(options.now);

  const [metricResult, receivablesResult, channelResult, countsResult] = await Promise.all([
    queryable.query<MetricRow>(`
      SELECT DISTINCT ON (metric.metric_key)
        metric.metric_key,
        metric.value,
        metric.unit,
        metric.dimensions,
        metric.observed_at,
        metric.period_start,
        metric.period_end,
        metric.granularity,
        COALESCE(NULLIF(metric.dimensions->>'externalId', ''), source.source_id) AS external_id,
        source.source_id,
        source.title AS source_title,
        source.content_text AS source_content,
        source.source_url,
        COALESCE(source.source_updated_at, source.updated_at) AS source_updated_at
      FROM ops_memory.metric_observations metric
      LEFT JOIN ops_memory.source_objects source
        ON source.id = metric.source_object_id
        AND source.organization_id = metric.organization_id
        AND source.deleted_at IS NULL
        AND source.source_deleted_at IS NULL
        AND source.is_current
      WHERE metric.organization_id = $1
        AND metric.deleted_at IS NULL
        AND metric.metric_key = ANY($2::text[])
        AND COALESCE(metric.period_end, metric.observed_at)::date <= $3::date
      ORDER BY metric.metric_key,
        COALESCE(metric.period_end, metric.observed_at) DESC,
        metric.observed_at DESC,
        metric.updated_at DESC
    `, [organization.id, METRIC_KEYS, businessDate]),
    queryable.query<ReceivablesRow>(`
      SELECT COALESCE(SUM(
        GREATEST(
          0,
          COALESCE(NULLIF(source.content_json->>'amountIncludingTaxCents', '')::numeric, 0)
          - COALESCE(NULLIF(source.content_json->>'paidCents', '')::numeric, 0)
        ) / 100
      ), 0) AS actionable_receivables
      FROM ops_memory.source_objects source
      WHERE source.organization_id = $1
        AND source.object_type = 'invoice'
        AND source.deleted_at IS NULL
        AND source.source_deleted_at IS NULL
        AND source.is_current
        AND source.content_json->>'status' = 'overdue'
        AND COALESCE(source.content_json->>'dueOn', '9999-12-31')::date <= $2::date
    `, [organization.id, businessDate]),
    queryable.query<ChannelRow>(`
      SELECT COUNT(*) FILTER (
        WHERE lower(COALESCE(source.content_json->>'channel', '')) = 'instagram'
          AND source.content_json->>'stage' = ANY(ARRAY['qualification', 'discovery', 'proposal', 'negotiation'])
      ) AS instagram_opportunities
      FROM ops_memory.source_objects source
      WHERE source.organization_id = $1
        AND source.object_type = 'opportunity'
        AND source.deleted_at IS NULL
        AND source.source_deleted_at IS NULL
        AND source.is_current
    `, [organization.id]),
    queryable.query<MemoryCountsRow>(`
      SELECT
        GREATEST(
          COALESCE((SELECT MAX(updated_at) FROM ops_memory.entities
            WHERE organization_id = $1 AND deleted_at IS NULL), to_timestamp(0)),
          COALESCE((SELECT MAX(updated_at) FROM ops_memory.source_objects
            WHERE organization_id = $1 AND deleted_at IS NULL), to_timestamp(0))
        ) AS indexed_at,
        (SELECT COUNT(*) FROM ops_memory.entities
          WHERE organization_id = $1 AND deleted_at IS NULL) AS entity_count,
        (SELECT COUNT(*) FROM ops_memory.source_objects
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND source_deleted_at IS NULL AND is_current) AS source_count
    `, [organization.id]),
  ]);

  const rows = metricResult.rows;
  const metrics = metricMap(rows);
  const paidChannels = ["google-ads", "meta-ads", "linkedin"];
  const acquisitionChannels = [...paidChannels, "instagram"];
  const financeSource = sourceFor(rows, "finance", `Snapshot finance · ${businessDate}`);
  const crmSource = sourceFor(rows, "crm", `Snapshot CRM · ${businessDate}`);
  const operationsSource = sourceFor(rows, "operations", `Snapshot opérations · ${businessDate}`);
  const seoSource = sourceFor(rows, "seo", `Snapshot SEO · ${businessDate}`);
  const googleSource = sourceFor(rows, "google-ads", `Google Ads · ${monthWindow(businessDate) ?? businessDate}`);
  const instagramSource = sourceFor(rows, "instagram", `Instagram · ${monthWindow(businessDate) ?? businessDate}`);
  const metaSource = sourceFor(rows, "meta-ads", `Meta Ads · ${monthWindow(businessDate) ?? businessDate}`);
  const acquisitionSource = googleSource ?? metaSource ?? instagramSource;
  const sourceIds = [...new Set(rows
    .map((row) => row.external_id || row.source_id)
    .filter((id): id is string => Boolean(id)))];
  const requiredSources = [
    ["finance", financeSource],
    ["crm", crmSource],
    ["operations", operationsSource],
    ["seo", seoSource],
    ["acquisition", acquisitionSource],
    ["googleAds", googleSource],
    ["instagram", instagramSource],
    ["meta", metaSource],
  ] as const;
  const counts = countsResult.rows[0];

  return {
    businessDate,
    generatedAt: (options.now ?? new Date()).toISOString(),
    finance: {
      revenueMonth: valueFor(metrics, "finance.revenue"),
      marginPercent: valueFor(metrics, "finance.gross_margin"),
      cashVisibilityDays: valueFor(metrics, "finance.cash_visibility"),
      overdueReceivables: valueFor(metrics, "finance.outstanding_receivables"),
      immediatelyActionableReceivables: finiteNumber(
        receivablesResult.rows[0]?.actionable_receivables,
      ),
      source: financeSource,
    },
    crm: {
      openPipeline: valueFor(metrics, "crm.open_pipeline"),
      weightedPipeline: valueFor(metrics, "crm.weighted_pipeline"),
      opportunities: valueFor(metrics, "crm.open_opportunities"),
      conversionRate90d: valueFor(metrics, "crm.conversion_rate_90d"),
      source: crmSource,
    },
    operations: {
      workshopLoadPercent: valueFor(metrics, "operations.workshop_load_percent"),
      availableCapacityDays: valueFor(metrics, "operations.available_capacity_days"),
      projectsAtRisk: valueFor(metrics, "operations.projects_at_risk"),
      sensitiveDeadlines: valueFor(metrics, "operations.sensitive_deadlines"),
      source: operationsSource,
    },
    seo: {
      window: monthWindow(rows.find((row) => row.metric_key === "seo.clicks")?.period_end),
      clicks: valueFor(metrics, "seo.clicks"),
      impressions: valueFor(metrics, "seo.impressions"),
      ctrPercent: valueFor(metrics, "seo.ctr"),
      averagePosition: valueFor(metrics, "seo.average_position"),
      focusKeywordPosition: valueFor(metrics, "seo.average_position"),
      focusKeywordClicks: valueFor(metrics, "seo.keyword_clicks_menuiserie_paris"),
      conversions: valueFor(metrics, "seo.conversions"),
      source: seoSource,
    },
    acquisition: {
      totalPaidSpend: sumMetrics(metrics, paidChannels.map((channel) => `${channel}.spend`)),
      attributedPipeline: sumMetrics(metrics, acquisitionChannels.map((channel) => `${channel}.pipeline`)),
      qualifiedLeads: sumMetrics(metrics, acquisitionChannels.map((channel) => `${channel}.qualified_leads`)),
      source: acquisitionSource,
    },
    googleAds: {
      spend: valueFor(metrics, "google-ads.spend"),
      clicks: valueFor(metrics, "google-ads.clicks"),
      leads: valueFor(metrics, "google-ads.qualified_leads"),
      qualifiedLeads: valueFor(metrics, "google-ads.qualified_leads"),
      attributedPipeline: valueFor(metrics, "google-ads.pipeline"),
      source: googleSource,
    },
    instagram: {
      views: valueFor(metrics, "instagram.views"),
      saves: valueFor(metrics, "instagram.saves"),
      attributedPipeline: valueFor(metrics, "instagram.pipeline"),
      opportunities: valueFor(metrics, "instagram.opportunities")
        ?? finiteNumber(channelResult.rows[0]?.instagram_opportunities),
      source: instagramSource,
    },
    meta: {
      spend: valueFor(metrics, "meta-ads.spend"),
      leads: valueFor(metrics, "meta-ads.qualified_leads"),
      qualifiedLeads: valueFor(metrics, "meta-ads.qualified_leads"),
      attributedPipeline: valueFor(metrics, "meta-ads.pipeline"),
      source: metaSource,
    },
    sourceIds,
    missingSources: requiredSources
      .filter(([, source]) => source === null)
      .map(([name]) => name),
    vault: {
      indexedAt: iso(counts?.indexed_at) || (options.now ?? new Date()).toISOString(),
      recordCount: finiteNumber(counts?.entity_count) ?? 0,
      scannedFiles: finiteNumber(counts?.source_count) ?? 0,
      truncated: false,
    },
  };
}
