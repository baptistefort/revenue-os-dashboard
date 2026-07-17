import { NextResponse } from "next/server";
import {
  buildObsidianVaultIndex,
  findObsidianMemoryRecord,
  type ObsidianMemoryRecord,
  type ObsidianVaultIndex,
} from "@/lib/obsidian-vault-memory";
import { resolveOpsDemoVaultRoot } from "@/lib/obsidian-write";
import type { OpsCompanyState } from "@/lib/ops-company-state";
import { buildCentralCompanyState } from "@/lib/central-memory/company-state";
import { centralMemoryConfigured } from "@/lib/central-memory/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

type SnapshotKind =
  | "finance"
  | "crm"
  | "operations"
  | "seo"
  | "acquisition"
  | "googleAds";

type SnapshotDefinition = {
  prefix: string;
  exactId: (compactDate: string) => string;
};

const SNAPSHOTS: Record<SnapshotKind, SnapshotDefinition> = {
  finance: {
    prefix: "FIN-SNAPSHOT-",
    exactId: (date) => `FIN-SNAPSHOT-${date}`,
  },
  crm: {
    prefix: "CRM-SNAPSHOT-",
    exactId: (date) => `CRM-SNAPSHOT-${date}`,
  },
  operations: {
    prefix: "OPS-SNAPSHOT-",
    exactId: (date) => `OPS-SNAPSHOT-${date}`,
  },
  seo: {
    prefix: "SEO-SNAPSHOT-",
    exactId: (date) => `SEO-SNAPSHOT-${date}`,
  },
  acquisition: {
    prefix: "ACQ-SNAPSHOT-",
    exactId: (date) => `ACQ-SNAPSHOT-${date}`,
  },
  googleAds: {
    prefix: "GADS-DAILY-",
    exactId: (date) => `GADS-DAILY-${date}`,
  },
};

function currentParisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date());
}

function businessDate() {
  const configured = process.env.OPS_BUSINESS_DATE?.trim();
  return configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)
    ? configured
    : currentParisDate();
}

function stringAttribute(record: ObsidianMemoryRecord | null, key: string) {
  const value = record?.attributes[key];
  return typeof value === "string" ? value : null;
}

function numberAttribute(record: ObsidianMemoryRecord | null, key: string) {
  const value = record?.attributes[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function periodFor(record: ObsidianMemoryRecord) {
  const explicit = stringAttribute(record, "period");
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const compact = record.id.match(/(?:19|20)\d{6}/)?.[0];
  if (!compact) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function latestSnapshot(
  index: ObsidianVaultIndex,
  definition: SnapshotDefinition,
  date: string,
) {
  const compactDate = date.replaceAll("-", "");
  const exact = findObsidianMemoryRecord(index, definition.exactId(compactDate));
  if (exact) return exact;

  return index.records
    .filter((record) => record.id.toLocaleUpperCase("fr").startsWith(definition.prefix))
    .map((record) => ({ record, period: periodFor(record) }))
    .filter(
      (candidate): candidate is { record: ObsidianMemoryRecord; period: string } => (
        candidate.period !== null && candidate.period <= date
      ),
    )
    .sort(
      (left, right) => right.period.localeCompare(left.period)
        || right.record.updatedAt.localeCompare(left.record.updatedAt),
    )[0]?.record ?? null;
}

function sourcePayload(record: ObsidianMemoryRecord | null) {
  if (!record) return null;
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    path: record.path,
    period: periodFor(record),
    updatedAt: record.updatedAt,
  };
}

function compactNumber(raw: string) {
  const value = Number(raw.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function summaryMetric(record: ObsidianMemoryRecord | null, pattern: RegExp, multiplier = 1) {
  if (!record) return null;
  const match = record.summary.match(pattern);
  const value = match?.[1] ? compactNumber(match[1]) : null;
  return value === null ? null : value * multiplier;
}

function monthScopedRecord(index: ObsidianVaultIndex, idPrefix: string, date: string) {
  const month = date.slice(0, 7);
  const exact = findObsidianMemoryRecord(index, `${idPrefix}-${month}`);
  if (exact) return exact;
  return index.records
    .filter((record) => record.id.toLocaleUpperCase("fr").startsWith(`${idPrefix}-`))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

function latestInstagramRecord(index: ObsidianVaultIndex) {
  return index.records
    .filter((record) => (
      /^IG-/i.test(record.id)
      && /(?:instagram|09_Marketing)/i.test([
        String(record.attributes.channel ?? ""),
        record.path,
        record.summary,
      ].join(" "))
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

export async function GET() {
  if (centralMemoryConfigured()) {
    try {
      const centralState = await buildCentralCompanyState({
        businessDate: businessDate(),
      });
      if (centralState) {
        return NextResponse.json(
          centralState,
          { headers: NO_STORE_HEADERS },
        );
      }
    } catch (error) {
      console.warn(
        "[company-state] Central memory unavailable, falling back to the Obsidian projection.",
        error,
      );
    }
  }

  try {
    const date = businessDate();
    const root = await resolveOpsDemoVaultRoot();
    const index = await buildObsidianVaultIndex(root);
    const records = Object.fromEntries(
      Object.entries(SNAPSHOTS).map(([kind, definition]) => [
        kind,
        latestSnapshot(index, definition, date),
      ]),
    ) as Record<SnapshotKind, ObsidianMemoryRecord | null>;
    const instagram = latestInstagramRecord(index);
    const meta = monthScopedRecord(index, "META", date);

    const finance = records.finance;
    const crm = records.crm;
    const operations = records.operations;
    const seo = records.seo;
    const acquisition = records.acquisition;
    const googleAds = records.googleAds;

    const sources = [
      finance,
      crm,
      operations,
      seo,
      acquisition,
      googleAds,
      instagram,
      meta,
    ].filter((record): record is ObsidianMemoryRecord => Boolean(record));
    const sourceEntries: Array<[string, ObsidianMemoryRecord | null]> = [
      ["finance", finance],
      ["crm", crm],
      ["operations", operations],
      ["seo", seo],
      ["acquisition", acquisition],
      ["googleAds", googleAds],
      ["instagram", instagram],
      ["meta", meta],
    ];

    const state = {
      businessDate: date,
      generatedAt: new Date().toISOString(),
      finance: {
          revenueMonth: numberAttribute(finance, "revenue_month"),
          marginPercent: numberAttribute(finance, "margin_percent"),
          cashVisibilityDays: numberAttribute(finance, "cash_visibility_days"),
          overdueReceivables: numberAttribute(finance, "overdue_receivables"),
          immediatelyActionableReceivables: numberAttribute(
            finance,
            "immediately_actionable_receivables",
          ),
          source: sourcePayload(finance),
        },
        crm: {
          openPipeline: numberAttribute(crm, "open_pipeline"),
          weightedPipeline: numberAttribute(crm, "weighted_pipeline"),
          opportunities: numberAttribute(crm, "opportunities"),
          conversionRate90d: numberAttribute(crm, "conversion_rate_90d"),
          source: sourcePayload(crm),
        },
        operations: {
          workshopLoadPercent: numberAttribute(operations, "workshop_load_percent"),
          availableCapacityDays: numberAttribute(operations, "available_capacity_days"),
          projectsAtRisk: numberAttribute(operations, "projects_at_risk"),
          sensitiveDeadlines: numberAttribute(operations, "sensitive_deadlines"),
          source: sourcePayload(operations),
        },
        seo: {
          window: stringAttribute(seo, "window"),
          clicks: numberAttribute(seo, "clicks"),
          impressions: numberAttribute(seo, "impressions"),
          ctrPercent: numberAttribute(seo, "ctr_percent"),
          averagePosition: numberAttribute(seo, "average_position"),
          focusKeywordPosition: numberAttribute(seo, "focus_keyword_position"),
          focusKeywordClicks: numberAttribute(seo, "focus_keyword_clicks"),
          conversions: numberAttribute(seo, "conversions"),
          source: sourcePayload(seo),
        },
        acquisition: {
          totalPaidSpend: numberAttribute(acquisition, "total_paid_spend"),
          attributedPipeline: numberAttribute(acquisition, "attributed_pipeline"),
          qualifiedLeads: numberAttribute(acquisition, "qualified_leads"),
          source: sourcePayload(acquisition),
        },
        googleAds: {
          spend: numberAttribute(googleAds, "spend"),
          clicks: numberAttribute(googleAds, "clicks"),
          leads: numberAttribute(googleAds, "leads"),
          qualifiedLeads: numberAttribute(googleAds, "qualified_leads"),
          attributedPipeline: numberAttribute(googleAds, "attributed_pipeline"),
          source: sourcePayload(googleAds),
        },
        instagram: {
          views: numberAttribute(instagram, "views")
            ?? summaryMetric(instagram, /([\d\s\u00a0\u202f]+)\s+vues/i),
          saves: numberAttribute(instagram, "saves")
            ?? summaryMetric(instagram, /([\d\s\u00a0\u202f]+)\s+enregistrements/i),
          attributedPipeline: numberAttribute(instagram, "attributed_pipeline")
            ?? summaryMetric(instagram, /([\d.,]+)\s*K€/i, 1_000),
          opportunities: numberAttribute(instagram, "opportunities")
            ?? (instagram && /opportunit[ée]/i.test(instagram.summary) ? 1 : null),
          source: sourcePayload(instagram),
        },
        meta: {
          spend: numberAttribute(meta, "spend")
            ?? summaryMetric(meta, /([\d\s\u00a0\u202f]+)\s*€\s+dépensés/i),
          leads: numberAttribute(meta, "leads")
            ?? summaryMetric(meta, /([\d\s\u00a0\u202f]+)\s+leads/i),
          qualifiedLeads: numberAttribute(meta, "qualified_leads")
            ?? (meta && /aucun\s+qualifié/i.test(meta.summary) ? 0 : null),
          attributedPipeline: numberAttribute(meta, "attributed_pipeline")
            ?? (meta && /aucun\s+qualifié/i.test(meta.summary) ? 0 : null),
          source: sourcePayload(meta),
        },
        sourceIds: sources.map((record) => record.id),
        missingSources: sourceEntries
          .filter(([, record]) => !record)
          .map(([kind]) => kind),
        vault: {
          indexedAt: index.indexedAt,
          recordCount: index.records.length,
          scannedFiles: index.scannedFiles,
          truncated: index.truncated,
        },
      } satisfies OpsCompanyState;

    return NextResponse.json(
      state,
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[company-state] Unable to read the Obsidian vault.", error);
    return NextResponse.json(
      { error: "company_state_unavailable" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
