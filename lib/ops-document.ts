export type OpsDocumentSection = {
  title: string;
  paragraphs: string[];
  bullets: string[];
};

export type OpsDocumentDecision = {
  title: string;
  rationale: string;
  owner?: string;
  horizon?: string;
  indicator?: string;
};

export type OpsDocumentPlan = {
  title: string;
  subtitle?: string;
  executiveSummary: string;
  sections: OpsDocumentSection[];
  decisions: OpsDocumentDecision[];
  sources: string[];
};

export type StoredOpsDocument = {
  id: string;
  name: string;
  type: "Rapport PDF";
  linked: string;
  owner: "OPS";
  updated: string;
  status: "Généré";
  facts: number;
  size: string;
  sizeBytes: number;
  pages: number;
  generated: true;
  url: string;
  downloadUrl: string;
  createdAt: string;
  sources: string[];
};
