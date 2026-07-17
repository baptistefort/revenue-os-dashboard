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
  type: "Rapport PDF" | "PDF importé";
  linked: string;
  owner: string;
  updated: string;
  status: "Généré" | "Importé";
  facts: number;
  size: string;
  sizeBytes: number;
  pages: number;
  generated: boolean;
  url: string;
  downloadUrl: string;
  createdAt: string;
  sources: string[];
};

/**
 * Read model returned by the Documents API.
 *
 * A listed document can either be a binary PDF managed by document-store or a
 * first-class Markdown document living in the Obsidian company vault. Keeping
 * the two origins in one explicit contract lets the existing Documents screen
 * render the living vault without pretending that every note has a PDF file.
 */
export type ListedOpsDocument = Omit<StoredOpsDocument, "type" | "status"> & {
  type: string;
  status: string;
  sourceKind: "pdf" | "obsidian";
  vaultPath?: string;
  summary?: string;
};

export function isStoredOpsDocument(value: unknown): value is StoredOpsDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<StoredOpsDocument>;
  return (
    typeof document.id === "string"
    && /^RAPPORT-[A-Z0-9-]{8,80}$/.test(document.id)
    && typeof document.name === "string"
    && (document.type === "Rapport PDF" || document.type === "PDF importé")
    && typeof document.linked === "string"
    && typeof document.owner === "string"
    && typeof document.updated === "string"
    && (document.status === "Généré" || document.status === "Importé")
    && typeof document.facts === "number"
    && Number.isFinite(document.facts)
    && typeof document.size === "string"
    && typeof document.sizeBytes === "number"
    && Number.isFinite(document.sizeBytes)
    && typeof document.pages === "number"
    && Number.isFinite(document.pages)
    && typeof document.generated === "boolean"
    && typeof document.url === "string"
    && typeof document.downloadUrl === "string"
    && typeof document.createdAt === "string"
    && Array.isArray(document.sources)
    && document.sources.every((source) => typeof source === "string")
  );
}
