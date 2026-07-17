import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { SqlQueryable } from "./database";
import { buildCentralCompanyState } from "./company-state";

type Call = { text: string; values?: unknown[] };

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function metric(metricKey: string, value: number, externalId: string, period = "2026-07-17") {
  return {
    metric_key: metricKey,
    value: String(value),
    unit: metricKey.includes("margin") || metricKey.includes("rate") || metricKey.endsWith(".ctr") ? "percent" : "count",
    dimensions: { externalId },
    observed_at: `${period}T07:50:00.000Z`,
    period_start: "2026-07-01T00:00:00.000Z",
    period_end: `${period}T00:00:00.000Z`,
    granularity: metricKey.includes("keyword_clicks") ? "day" : "month",
    external_id: externalId,
    source_id: externalId.toLocaleLowerCase("fr"),
    source_title: metricKey,
    source_content: `${metricKey} ${value}`,
    source_url: null,
    source_updated_at: `${period}T07:50:00.000Z`,
  };
}

class CompanyStateQueryable implements SqlQueryable {
  calls: Call[] = [];
  constructor(private readonly organizationExists = true) {}

  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    if (text.includes("FROM ops_memory.organizations")) {
      return queryResult(this.organizationExists
        ? [{ id: "org-atelier", slug: "atelier-beaumarchais", display_name: "Atelier Beaumarchais" }]
        : []) as unknown as QueryResult<Row>;
    }
    if (text.includes("FROM ops_memory.metric_observations")) {
      return queryResult([
        metric("finance.revenue", 42_800, "FIN-CA-2026-07"),
        metric("finance.gross_margin", 29, "FIN-MARGE-2026-07"),
        metric("finance.cash_visibility", 67, "FIN-CASH-2026-07"),
        metric("finance.outstanding_receivables", 24_300, "FIN-CREANCES-2026-07"),
        metric("crm.open_pipeline", 184_000, "CRM-PIPE-2026-07"),
        metric("crm.weighted_pipeline", 96_000, "CRM-WEIGHTED-2026-07"),
        metric("crm.open_opportunities", 4, "CRM-OPPORTUNITIES-2026-07"),
        metric("crm.conversion_rate_90d", 31, "CRM-CONVERSION-2026-07"),
        metric("operations.workshop_load_percent", 86, "OPS-LOAD-2026-07"),
        metric("operations.available_capacity_days", 4, "OPS-CAPACITY-2026-07"),
        metric("operations.projects_at_risk", 2, "OPS-RISKS-2026-07"),
        metric("operations.sensitive_deadlines", 7, "OPS-DEADLINES-2026-07"),
        metric("seo.clicks", 337, "SEO-CLICK-2026-07"),
        metric("seo.impressions", 7_810, "SEO-IMP-2026-07"),
        metric("seo.ctr", 4.32, "SEO-CTR-2026-07"),
        metric("seo.average_position", 11.7, "SEO-POS-2026-07"),
        metric("seo.keyword_clicks_menuiserie_paris", 50, "SEO-DAY-20260716-KEYWORD", "2026-07-16"),
        metric("seo.conversions", 7, "SEO-CONV-2026-07"),
        metric("google-ads.spend", 685, "GOOGLE-ADS-SPEND-2026-07"),
        metric("google-ads.clicks", 428, "GOOGLE-ADS-CLICKS-2026-07"),
        metric("google-ads.qualified_leads", 12, "GOOGLE-ADS-LEADS-2026-07"),
        metric("google-ads.pipeline", 57_950, "GOOGLE-ADS-PIPE-2026-07"),
        metric("meta-ads.spend", 304, "META-ADS-SPEND-2026-07"),
        metric("meta-ads.qualified_leads", 4, "META-ADS-LEADS-2026-07"),
        metric("meta-ads.pipeline", 9_720, "META-ADS-PIPE-2026-07"),
        metric("instagram.spend", 0, "INSTAGRAM-SPEND-2026-07"),
        metric("instagram.views", 18_400, "INSTAGRAM-VIEWS-2026-07"),
        metric("instagram.saves", 612, "INSTAGRAM-SAVES-2026-07"),
        metric("instagram.opportunities", 1, "INSTAGRAM-OPPORTUNITIES-2026-07"),
        metric("instagram.qualified_leads", 7, "INSTAGRAM-LEADS-2026-07"),
        metric("instagram.pipeline", 20_100, "INSTAGRAM-PIPE-2026-07"),
        metric("linkedin.spend", 123, "LINKEDIN-SPEND-2026-07"),
        metric("linkedin.qualified_leads", 4, "LINKEDIN-LEADS-2026-07"),
        metric("linkedin.pipeline", 13_030, "LINKEDIN-PIPE-2026-07"),
      ]) as unknown as QueryResult<Row>;
    }
    if (text.includes("actionable_receivables")) {
      return queryResult([{ actionable_receivables: "20200" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("instagram_opportunities")) {
      return queryResult([{ instagram_opportunities: "1" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("entity_count")) {
      return queryResult([{
        indexed_at: "2026-07-17T08:00:00.000Z",
        entity_count: "1399",
        source_count: "3215",
      }]) as unknown as QueryResult<Row>;
    }
    throw new Error(`Unexpected SQL: ${text.slice(0, 120)}`);
  }
}

test("buildCentralCompanyState exposes the tenant-scoped operational truth", async () => {
  const queryable = new CompanyStateQueryable();
  const state = await buildCentralCompanyState({
    queryable,
    organizationSlug: "atelier-beaumarchais",
    businessDate: "2026-07-17",
    now: new Date("2026-07-17T08:30:00.000Z"),
  });

  assert.ok(state);
  assert.equal(state.finance.revenueMonth, 42_800);
  assert.equal(state.finance.marginPercent, 29);
  assert.equal(state.finance.cashVisibilityDays, 67);
  assert.equal(state.finance.overdueReceivables, 24_300);
  assert.equal(state.finance.immediatelyActionableReceivables, 20_200);
  assert.equal(state.crm.openPipeline, 184_000);
  assert.equal(state.crm.weightedPipeline, 96_000);
  assert.equal(state.crm.opportunities, 4);
  assert.equal(state.crm.conversionRate90d, 31);
  assert.deepEqual(state.operations, {
    workshopLoadPercent: 86,
    availableCapacityDays: 4,
    projectsAtRisk: 2,
    sensitiveDeadlines: 7,
    source: state.operations.source,
  });
  assert.equal(state.seo.window, "juillet 2026");
  assert.equal(state.seo.impressions, 7_810);
  assert.equal(state.seo.clicks, 337);
  assert.equal(state.seo.focusKeywordClicks, 50);
  assert.equal(state.acquisition.totalPaidSpend, 1_112);
  assert.equal(state.acquisition.attributedPipeline, 100_800);
  assert.equal(state.acquisition.qualifiedLeads, 27);
  assert.equal(state.googleAds.spend, 685);
  assert.equal(state.googleAds.clicks, 428);
  assert.equal(state.instagram.views, 18_400);
  assert.equal(state.instagram.saves, 612);
  assert.equal(state.instagram.opportunities, 1);
  assert.equal(state.meta.attributedPipeline, 9_720);
  assert.equal(state.vault.recordCount, 1_399);
  assert.equal(state.vault.scannedFiles, 3_215);
  assert.equal(state.missingSources.length, 0);
  assert.ok(state.sourceIds.includes("FIN-CA-2026-07"));
  assert.equal(state.finance.source?.path, "central://metrics/FIN-CA-2026-07");

  assert.deepEqual(queryable.calls[0]?.values, ["atelier-beaumarchais"]);
  const metricCall = queryable.calls.find((call) => call.text.includes("metric_observations"));
  assert.equal(metricCall?.values?.[0], "org-atelier");
  assert.equal(metricCall?.values?.[2], "2026-07-17");
  assert.match(metricCall?.text ?? "", /metric\.organization_id = \$1/);
});

test("buildCentralCompanyState returns null without crossing to another tenant", async () => {
  const queryable = new CompanyStateQueryable(false);
  const state = await buildCentralCompanyState({
    queryable,
    organizationSlug: "unknown-company",
    businessDate: "2026-07-17",
  });
  assert.equal(state, null);
  assert.equal(queryable.calls.length, 1);
  assert.deepEqual(queryable.calls[0]?.values, ["unknown-company"]);
});
