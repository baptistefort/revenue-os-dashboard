export type MemorySource =
  | "gmail"
  | "notion"
  | "twenty"
  | "slack"
  | "drive"
  | "calendar"
  | "pennylane"
  | "google-search-console"
  | "google-ads"
  | "google-analytics"
  | "meta-ads"
  | "instagram"
  | "linkedin"
  | "personio"
  | "inventory"
  | "ops";

export type Confidentiality = "public" | "internal" | "restricted";

export type SourceTrace = {
  source: MemorySource;
  sourceId: string;
  sourceUrl?: string;
  sourceUpdatedAt: string;
  ingestedAt: string;
  checksum: string;
};

export type MemoryRecord = {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  confidentiality: Confidentiality;
  trace: SourceTrace;
  version: number;
  deletedAt: string | null;
};

export type ClientRecord = MemoryRecord & {
  kind: "client";
  name: string;
  legalName: string;
  segment: "hotel" | "architecture" | "retail" | "office" | "construction" | "services";
  city: string;
  employeeRange: string;
  status: "client" | "prospect" | "former-client";
  healthScore: number;
  accountOwnerId: string;
  tags: string[];
};

export type ContactRecord = MemoryRecord & {
  kind: "contact";
  clientId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: string;
  email: string;
  phone: string;
  isDecisionMaker: boolean;
  preferredChannel: "email" | "phone" | "linkedin";
};

export type OpportunityStage = "qualification" | "discovery" | "proposal" | "negotiation" | "won" | "lost";

export type OpportunityRecord = MemoryRecord & {
  kind: "opportunity";
  clientId: string;
  primaryContactId: string;
  name: string;
  amountCents: number;
  probability: number;
  stage: OpportunityStage;
  expectedCloseDate: string;
  ownerId: string;
  acquisitionChannel: "google-ads" | "seo" | "instagram" | "referral" | "linkedin" | "outbound";
  nextStep: string;
  lostReason: string | null;
};

export type ProjectRecord = MemoryRecord & {
  kind: "project";
  clientId: string;
  opportunityId: string;
  name: string;
  status: "planned" | "active" | "at-risk" | "completed";
  startDate: string;
  targetDate: string;
  budgetCents: number;
  recognizedRevenueCents: number;
  costBudgetCents: number;
  costActualCents: number;
  progressPercent: number;
  ownerId: string;
  teamMemberIds: string[];
  riskSummary: string | null;
};

export type InvoiceRecord = MemoryRecord & {
  kind: "invoice";
  clientId: string;
  projectId: string | null;
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string;
  amountExcludingTaxCents: number;
  taxCents: number;
  amountIncludingTaxCents: number;
  paidCents: number;
  status: "paid" | "due" | "overdue";
};

export type PaymentRecord = MemoryRecord & {
  kind: "payment";
  clientId: string;
  invoiceId: string;
  paidOn: string;
  amountCents: number;
  method: "bank-transfer" | "direct-debit" | "card";
  bankReference: string;
};

export type EmailThreadRecord = MemoryRecord & {
  kind: "email-thread";
  clientId: string;
  contactIds: string[];
  subject: string;
  projectId: string | null;
  opportunityId: string | null;
  messageIds: string[];
  lastMessageAt: string;
  status: "active" | "waiting-client" | "waiting-us" | "closed";
  extractedSummary: string;
};

export type EmailMessageRecord = MemoryRecord & {
  kind: "email-message";
  threadId: string;
  clientId: string;
  projectId: string | null;
  sender: string;
  recipients: string[];
  sentAt: string;
  subject: string;
  text: string;
  direction: "inbound" | "outbound";
  inReplyToId: string | null;
  attachmentDocumentIds: string[];
  extractedIntent: "question" | "decision" | "update" | "approval" | "problem" | "follow-up";
  requiresAction: boolean;
};

export type MeetingRecord = MemoryRecord & {
  kind: "meeting";
  clientId: string;
  projectId: string | null;
  title: string;
  startsAt: string;
  durationMinutes: number;
  participantIds: string[];
  summary: string;
  decisionIds: string[];
  taskIds: string[];
  transcriptDocumentId: string;
};

export type MetricDomain =
  | "finance"
  | "seo"
  | "google-ads"
  | "meta-ads"
  | "instagram"
  | "linkedin"
  | "crm"
  | "operations"
  | "web"
  | "customer"
  | "hr"
  | "procurement";

export type MetricRecord = MemoryRecord & {
  kind: "metric";
  domain: MetricDomain;
  metric: string;
  periodStart: string;
  periodEnd: string;
  value: number;
  unit: "EUR" | "percent" | "count" | "days" | "position";
  dimensions: Record<string, string>;
};

export type DecisionRecord = MemoryRecord & {
  kind: "decision";
  clientId: string | null;
  projectId: string | null;
  title: string;
  decidedOn: string;
  decidedByIds: string[];
  rationale: string;
  outcome: string;
  status: "active" | "superseded" | "completed";
  sourceMeetingId: string | null;
};

export type TaskRecord = MemoryRecord & {
  kind: "task";
  clientId: string | null;
  projectId: string | null;
  opportunityId: string | null;
  title: string;
  description: string;
  ownerId: string;
  dueOn: string;
  priority: "low" | "normal" | "high";
  status: "todo" | "in-progress" | "blocked" | "done";
  sourceDecisionId: string | null;
  completedAt: string | null;
};

export type DocumentRecord = MemoryRecord & {
  kind: "document";
  clientId: string | null;
  projectId: string | null;
  title: string;
  documentType: "quote" | "invoice" | "contract" | "amendment" | "meeting-notes" | "report" | "procedure" | "attachment";
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  summary: string;
};

export type CommitmentRecord = MemoryRecord & {
  kind: "commitment";
  clientId: string;
  contactId: string;
  projectId: string | null;
  description: string;
  committedBy: "company" | "client";
  committedOn: string;
  dueOn: string;
  status: "open" | "kept" | "late" | "cancelled";
  evidenceType: "email" | "meeting" | "document";
  evidenceId: string;
};

export type RelationKind =
  | "works-at"
  | "owns"
  | "participates-in"
  | "concerns"
  | "generated"
  | "paid-by"
  | "documents"
  | "decided-in"
  | "creates-task"
  | "committed-to"
  | "mentions"
  | "influences"
  | "depends-on";

export type RelationRecord = MemoryRecord & {
  kind: "relation";
  fromId: string;
  toId: string;
  relation: RelationKind;
  validFrom: string;
  validTo: string | null;
  confidence: number;
  evidenceIds: string[];
};

export type SourceEventRecord = MemoryRecord & {
  kind: "source-event";
  eventType: "created" | "updated" | "received" | "sent" | "paid" | "decided" | "measured";
  objectType: string;
  objectId: string;
  occurredAt: string;
  payload: Record<string, string | number | boolean | null>;
};

export type CompanyMemoryUniverse = {
  schemaVersion: "1.0";
  seed: string;
  generatedAt: string;
  tenant: {
    id: string;
    name: string;
    timezone: "Europe/Paris";
    currency: "EUR";
  };
  team: Array<{ id: string; name: string; role: string; email: string }>;
  clients: ClientRecord[];
  contacts: ContactRecord[];
  opportunities: OpportunityRecord[];
  projects: ProjectRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  emailThreads: EmailThreadRecord[];
  emailMessages: EmailMessageRecord[];
  meetings: MeetingRecord[];
  metrics: MetricRecord[];
  decisions: DecisionRecord[];
  tasks: TaskRecord[];
  documents: DocumentRecord[];
  commitments: CommitmentRecord[];
  relations: RelationRecord[];
  sourceEvents: SourceEventRecord[];
};

export type UniverseAggregates = {
  counts: Record<Exclude<keyof CompanyMemoryUniverse, "schemaVersion" | "seed" | "generatedAt" | "tenant">, number>;
  openPipelineCents: number;
  outstandingReceivablesCents: number;
  overdueReceivablesCents: number;
  currentMonthRevenueCents: number;
  currentGrossMarginPercent: number;
  graphNodeCount: number;
  graphRelationCount: number;
};
