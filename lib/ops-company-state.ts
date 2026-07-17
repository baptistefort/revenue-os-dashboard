export type OpsCompanyStateSource = {
  id: string;
  title: string;
  summary: string;
  path: string;
  period: string | null;
  updatedAt: string;
};

export type OpsCompanyState = {
  businessDate: string;
  generatedAt: string;
  finance: {
    revenueMonth: number | null;
    marginPercent: number | null;
    cashVisibilityDays: number | null;
    overdueReceivables: number | null;
    immediatelyActionableReceivables: number | null;
    source: OpsCompanyStateSource | null;
  };
  crm: {
    openPipeline: number | null;
    weightedPipeline: number | null;
    opportunities: number | null;
    conversionRate90d: number | null;
    source: OpsCompanyStateSource | null;
  };
  operations: {
    workshopLoadPercent: number | null;
    availableCapacityDays: number | null;
    projectsAtRisk: number | null;
    sensitiveDeadlines: number | null;
    source: OpsCompanyStateSource | null;
  };
  seo: {
    window: string | null;
    clicks: number | null;
    impressions: number | null;
    ctrPercent: number | null;
    averagePosition: number | null;
    focusKeywordPosition: number | null;
    focusKeywordClicks: number | null;
    conversions: number | null;
    source: OpsCompanyStateSource | null;
  };
  acquisition: {
    totalPaidSpend: number | null;
    attributedPipeline: number | null;
    qualifiedLeads: number | null;
    source: OpsCompanyStateSource | null;
  };
  googleAds: {
    spend: number | null;
    clicks: number | null;
    leads: number | null;
    qualifiedLeads: number | null;
    attributedPipeline: number | null;
    source: OpsCompanyStateSource | null;
  };
  instagram: {
    views: number | null;
    saves: number | null;
    attributedPipeline: number | null;
    opportunities: number | null;
    source: OpsCompanyStateSource | null;
  };
  meta: {
    spend: number | null;
    leads: number | null;
    qualifiedLeads: number | null;
    attributedPipeline: number | null;
    source: OpsCompanyStateSource | null;
  };
  sourceIds: string[];
  missingSources: string[];
  vault: {
    indexedAt: string;
    recordCount: number;
    scannedFiles: number;
    truncated: boolean;
  };
};
