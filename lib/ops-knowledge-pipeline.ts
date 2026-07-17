export type KnowledgeSource =
  | "email"
  | "crm"
  | "slack"
  | "teams"
  | "notion"
  | "drive"
  | "calendar"
  | "seo"
  | "ads"
  | "finance";

export type KnowledgeOperation = "upsert" | "delete";
export type EntityKind = "organization" | "person" | "project" | "document" | "channel";
export type Confidentiality = "public" | "internal" | "confidential" | "restricted";
export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export interface KnowledgeAccess {
  confidentiality: Confidentiality;
  allowedGroups?: string[];
  containsPersonalData?: boolean;
  retentionUntil?: string;
}

export interface EntityIdentifierInput {
  scheme: "email" | "domain" | "siret" | "phone" | "url" | "external";
  value: string;
}

export interface EntityCandidateInput {
  ref: string;
  kind: EntityKind;
  name: string;
  identifiers?: EntityIdentifierInput[];
  aliases?: string[];
  attributes?: Record<string, JsonValue>;
}

interface AccessControlledInput {
  access?: Partial<KnowledgeAccess>;
}

export interface FactInput extends AccessControlledInput {
  key?: string;
  subjectRef: string;
  predicate: string;
  value: JsonValue;
  validAt?: string;
  confidence?: number;
}

export interface RelationInput extends AccessControlledInput {
  fromRef: string;
  toRef: string;
  type: string;
  confidence?: number;
}

export interface CommitmentInput extends AccessControlledInput {
  key?: string;
  ownerRef: string;
  beneficiaryRef?: string;
  action: string;
  dueAt?: string;
  status?: "open" | "done" | "cancelled";
}

export interface DecisionInput extends AccessControlledInput {
  key?: string;
  subjectRef: string;
  decision: string;
  decidedByRef?: string;
  decidedAt?: string;
  status?: "proposed" | "approved" | "rejected" | "superseded";
}

export interface TaskInput extends AccessControlledInput {
  key?: string;
  subjectRef: string;
  title: string;
  ownerRef?: string;
  dueAt?: string;
  status?: "open" | "in_progress" | "done" | "cancelled";
}

export interface MetricInput extends AccessControlledInput {
  key?: string;
  subjectRef: string;
  name: string;
  value: number;
  unit: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface DurableNoteInput extends AccessControlledInput {
  key: string;
  title: string;
  summary: string;
  body?: string;
  entityRefs?: string[];
  topic?: string;
}

export interface KnowledgePayload {
  entities: EntityCandidateInput[];
  facts?: FactInput[];
  relations?: RelationInput[];
  commitments?: CommitmentInput[];
  decisions?: DecisionInput[];
  tasks?: TaskInput[];
  metrics?: MetricInput[];
  notes?: DurableNoteInput[];
}

export interface KnowledgeEvent {
  eventId: string;
  tenantId: string;
  source: KnowledgeSource;
  sourceRecordId: string;
  sourceVersion: string;
  operation: KnowledgeOperation;
  observedAt: string;
  occurredAt?: string;
  access: KnowledgeAccess;
  payload?: KnowledgePayload;
}

export interface ProvenanceRef {
  eventId: string;
  source: KnowledgeSource;
  sourceRecordId: string;
  sourceVersion: string;
  observedAt: string;
  occurredAt?: string;
}

export interface ResolvedEntity {
  id: string;
  kind: EntityKind;
  displayName: string;
  aliases: string[];
  identifiers: EntityIdentifierInput[];
  attributes: Record<string, JsonValue>;
  access: KnowledgeAccess;
  provenance: ProvenanceRef[];
}

interface SourcedItem {
  id: string;
  access: KnowledgeAccess;
  provenance: ProvenanceRef[];
}

export interface SourcedFact extends SourcedItem {
  subjectId: string;
  predicate: string;
  value: JsonValue;
  validAt?: string;
  confidence: number;
}

export interface KnowledgeRelation extends SourcedItem {
  fromId: string;
  toId: string;
  type: string;
  confidence: number;
}

export interface KnowledgeCommitment extends SourcedItem {
  ownerId: string;
  beneficiaryId?: string;
  action: string;
  dueAt?: string;
  status: "open" | "done" | "cancelled";
}

export interface KnowledgeDecision extends SourcedItem {
  subjectId: string;
  decision: string;
  decidedById?: string;
  decidedAt?: string;
  status: "proposed" | "approved" | "rejected" | "superseded";
}

export interface KnowledgeTask extends SourcedItem {
  subjectId: string;
  title: string;
  ownerId?: string;
  dueAt?: string;
  status: "open" | "in_progress" | "done" | "cancelled";
}

export interface KnowledgeMetric extends SourcedItem {
  subjectId: string;
  name: string;
  value: number;
  unit: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface DurableKnowledgeNote extends SourcedItem {
  kind: "entity" | "topic";
  title: string;
  summary: string;
  body: string;
  entityIds: string[];
  topic?: string;
  factIds: string[];
  relationIds: string[];
  commitmentIds: string[];
  decisionIds: string[];
  taskIds: string[];
  metricIds: string[];
}

export interface KnowledgeJournalEntry {
  id: string;
  eventId: string;
  action: "upsert" | "delete" | "ignored_duplicate" | "ignored_stale";
  recordKey: string;
  source: KnowledgeSource;
  sourceVersion: string;
  observedAt: string;
}

interface StoredContribution {
  recordKey: string;
  event: KnowledgeEvent;
}

interface SourceClock {
  sourceVersion: string;
  observedAt: string;
  deleted: boolean;
  eventId: string;
}

export interface KnowledgeState {
  schemaVersion: 1;
  tenantId: string;
  contributions: Record<string, StoredContribution>;
  sourceClocks: Record<string, SourceClock>;
  processedEvents: Record<string, true>;
  identityRegistry: Record<string, string>;
  journal: KnowledgeJournalEntry[];
  entities: ResolvedEntity[];
  facts: SourcedFact[];
  relations: KnowledgeRelation[];
  commitments: KnowledgeCommitment[];
  decisions: KnowledgeDecision[];
  tasks: KnowledgeTask[];
  metrics: KnowledgeMetric[];
  notes: DurableKnowledgeNote[];
}

const confidentialityRank: Record<Confidentiality, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

const kindPrefix: Record<EntityKind, string> = {
  organization: "ORG",
  person: "PER",
  project: "PRJ",
  document: "DOC",
  channel: "CHN",
};

function stableHash(value: string) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(36)}${right.toString(36)}`.toUpperCase().padStart(12, "0").slice(0, 12);
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9@.+-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeIdentifier(identifier: EntityIdentifierInput) {
  let value = identifier.value.trim();
  if (identifier.scheme === "email" || identifier.scheme === "domain" || identifier.scheme === "url") {
    value = value.toLocaleLowerCase("en");
  }
  if (identifier.scheme === "domain") {
    value = value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }
  if (identifier.scheme === "phone" || identifier.scheme === "siret") {
    value = value.replace(/[^0-9+]/g, "");
  }
  return { scheme: identifier.scheme, value } satisfies EntityIdentifierInput;
}

function identityKey(identifier: EntityIdentifierInput) {
  const normalized = normalizeIdentifier(identifier);
  return `${normalized.scheme}:${normalized.value}`;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, candidate]) => `${JSON.stringify(key)}:${canonicalJson(candidate)}`)
    .join(",")}}`;
}

function normalizedAccess(base: KnowledgeAccess, override?: Partial<KnowledgeAccess>): KnowledgeAccess {
  const confidentiality = override?.confidentiality ?? base.confidentiality;
  return {
    confidentiality,
    allowedGroups: [...new Set(override?.allowedGroups ?? base.allowedGroups ?? [])]
      .map((group) => group.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right)),
    containsPersonalData: override?.containsPersonalData ?? base.containsPersonalData ?? false,
    retentionUntil: override?.retentionUntil ?? base.retentionUntil,
  };
}

function accessFingerprint(access: KnowledgeAccess) {
  return [
    access.confidentiality,
    access.containsPersonalData ? "pii" : "no-pii",
    access.retentionUntil ?? "permanent",
    ...(access.allowedGroups ?? []),
  ].join("|");
}

function mergeAccess(accesses: KnowledgeAccess[]): KnowledgeAccess {
  if (!accesses.length) return { confidentiality: "internal", allowedGroups: [] };
  const confidentiality = accesses.reduce((current, access) => (
    confidentialityRank[access.confidentiality] > confidentialityRank[current]
      ? access.confidentiality
      : current
  ), "public" as Confidentiality);
  const restrictedSets = accesses
    .filter((access) => (access.allowedGroups?.length ?? 0) > 0)
    .map((access) => new Set(access.allowedGroups));
  const allowedGroups = restrictedSets.length
    ? [...restrictedSets.slice(1).reduce((current, candidate) => (
      new Set([...current].filter((group) => candidate.has(group)))
    ), restrictedSets[0])].sort((left, right) => left.localeCompare(right))
    : [];
  const retentionDates = accesses.map((access) => access.retentionUntil).filter((value): value is string => Boolean(value));
  return {
    confidentiality,
    allowedGroups,
    containsPersonalData: accesses.some((access) => access.containsPersonalData),
    retentionUntil: retentionDates.sort()[0],
  };
}

function provenance(event: KnowledgeEvent): ProvenanceRef {
  return {
    eventId: event.eventId,
    source: event.source,
    sourceRecordId: event.sourceRecordId,
    sourceVersion: event.sourceVersion,
    observedAt: event.observedAt,
    occurredAt: event.occurredAt,
  };
}

function recordKey(event: Pick<KnowledgeEvent, "tenantId" | "source" | "sourceRecordId">) {
  return `${event.tenantId}:${event.source}:${event.sourceRecordId}`;
}

function compareClock(event: KnowledgeEvent, current: SourceClock | undefined) {
  if (!current) return 1;
  const time = event.observedAt.localeCompare(current.observedAt);
  if (time !== 0) return time;
  return event.sourceVersion.localeCompare(current.sourceVersion, "en", { numeric: true });
}

function cloneState(state: KnowledgeState): KnowledgeState {
  return structuredClone(state);
}

export function createKnowledgeState(tenantId: string): KnowledgeState {
  return {
    schemaVersion: 1,
    tenantId,
    contributions: {},
    sourceClocks: {},
    processedEvents: {},
    identityRegistry: {},
    journal: [],
    entities: [],
    facts: [],
    relations: [],
    commitments: [],
    decisions: [],
    tasks: [],
    metrics: [],
    notes: [],
  };
}

interface CandidateContext {
  contribution: StoredContribution;
  candidate: EntityCandidateInput;
  nodeKey: string;
  identifiers: EntityIdentifierInput[];
  identityKeys: string[];
}

class DisjointSet {
  private readonly parents = new Map<string, string>();

  add(value: string) {
    if (!this.parents.has(value)) this.parents.set(value, value);
  }

  find(value: string): string {
    const parent = this.parents.get(value);
    if (!parent) throw new Error(`Unknown identity node: ${value}`);
    if (parent === value) return value;
    const root = this.find(parent);
    this.parents.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [winner, loser] = [leftRoot, rightRoot].sort();
    this.parents.set(loser, winner);
  }
}

function resolveEntities(state: KnowledgeState, contributions: StoredContribution[]) {
  const candidates: CandidateContext[] = [];
  const set = new DisjointSet();
  const nodesByIdentity = new Map<string, string[]>();
  const nodesByFallbackName = new Map<string, string[]>();

  for (const contribution of contributions) {
    for (const candidate of contribution.event.payload?.entities ?? []) {
      const nodeKey = `${contribution.recordKey}::${candidate.ref}`;
      const identifiers = (candidate.identifiers ?? []).map(normalizeIdentifier).filter((item) => item.value);
      const identityKeys = identifiers.map(identityKey);
      candidates.push({ contribution, candidate, nodeKey, identifiers, identityKeys });
      set.add(nodeKey);
      for (const key of identityKeys) {
        const values = nodesByIdentity.get(key) ?? [];
        values.push(nodeKey);
        nodesByIdentity.set(key, values);
      }
      if (!identityKeys.length) {
        const fallback = `name:${candidate.kind}:${normalizeText(candidate.name)}`;
        const values = nodesByFallbackName.get(fallback) ?? [];
        values.push(nodeKey);
        nodesByFallbackName.set(fallback, values);
      }
    }
  }

  for (const values of [...nodesByIdentity.values(), ...nodesByFallbackName.values()]) {
    const [first, ...rest] = values;
    if (!first) continue;
    rest.forEach((value) => set.union(first, value));
  }

  const groups = new Map<string, CandidateContext[]>();
  for (const candidate of candidates) {
    const root = set.find(candidate.nodeKey);
    const values = groups.get(root) ?? [];
    values.push(candidate);
    groups.set(root, values);
  }

  const refMap = new Map<string, string>();
  const entities: ResolvedEntity[] = [];

  for (const group of groups.values()) {
    group.sort((left, right) => (
      left.contribution.event.observedAt.localeCompare(right.contribution.event.observedAt)
      || left.nodeKey.localeCompare(right.nodeKey)
    ));
    const kind = group[0]?.candidate.kind;
    if (!kind) continue;
    const keys = [...new Set(group.flatMap((candidate) => candidate.identityKeys))].sort();
    const previousIds = [...new Set(keys.map((key) => state.identityRegistry[key]).filter(Boolean))].sort();
    const fallbackKey = `name:${kind}:${normalizeText(group[0].candidate.name)}`;
    const entityId = previousIds[0] ?? `${kindPrefix[kind]}-${stableHash(`${state.tenantId}|${keys[0] ?? fallbackKey}`)}`;

    if (previousIds.length > 1) {
      const losingIds = new Set(previousIds.slice(1));
      for (const [key, value] of Object.entries(state.identityRegistry)) {
        if (losingIds.has(value)) state.identityRegistry[key] = entityId;
      }
    }
    for (const key of keys) state.identityRegistry[key] = entityId;
    if (!keys.length) state.identityRegistry[fallbackKey] = entityId;

    const latest = group[group.length - 1];
    const aliases = [...new Set(group.flatMap((candidate) => [
      candidate.candidate.name,
      ...(candidate.candidate.aliases ?? []),
    ]))].sort((left, right) => left.localeCompare(right));
    const identifiers = [...new Map(group.flatMap((candidate) => candidate.identifiers)
      .map((identifier) => [identityKey(identifier), identifier])).values()]
      .sort((left, right) => identityKey(left).localeCompare(identityKey(right)));
    const attributes = Object.assign({}, ...group.map((candidate) => candidate.candidate.attributes ?? {}));
    const provenanceRefs = group.map((candidate) => provenance(candidate.contribution.event));
    const access = mergeAccess(group.map((candidate) => normalizedAccess(candidate.contribution.event.access)));

    entities.push({
      id: entityId,
      kind,
      displayName: latest.candidate.name,
      aliases,
      identifiers,
      attributes,
      access,
      provenance: dedupeProvenance(provenanceRefs),
    });
    for (const candidate of group) refMap.set(`${candidate.contribution.recordKey}::${candidate.candidate.ref}`, entityId);
  }

  return {
    entities: entities.sort((left, right) => left.id.localeCompare(right.id)),
    refMap,
  };
}

function dedupeProvenance(values: ProvenanceRef[]) {
  return [...new Map(values.map((value) => [`${value.source}:${value.sourceRecordId}:${value.sourceVersion}`, value])).values()]
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.eventId.localeCompare(right.eventId));
}

function resolveReference(refMap: Map<string, string>, contribution: StoredContribution, ref: string) {
  return refMap.get(`${contribution.recordKey}::${ref}`) ?? ref;
}

interface ItemCandidate<T> {
  logicalKey: string;
  exactKey: string;
  value: T;
  observedAt: string;
  provenance: ProvenanceRef;
  access: KnowledgeAccess;
}

function consolidate<T extends SourcedItem>(items: ItemCandidate<Omit<T, keyof SourcedItem>>[], prefix: string): T[] {
  const groups = new Map<string, ItemCandidate<Omit<T, keyof SourcedItem>>[]>();
  for (const item of items) {
    const values = groups.get(item.logicalKey) ?? [];
    values.push(item);
    groups.set(item.logicalKey, values);
  }
  const output: T[] = [];
  for (const [logicalKey, values] of groups) {
    values.sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.provenance.eventId.localeCompare(right.provenance.eventId));
    const latest = values[values.length - 1];
    if (!latest) continue;
    const matching = values.filter((candidate) => candidate.exactKey === latest.exactKey);
    output.push({
      id: `${prefix}-${stableHash(logicalKey)}`,
      ...latest.value,
      access: mergeAccess(matching.map((candidate) => candidate.access)),
      provenance: dedupeProvenance(matching.map((candidate) => candidate.provenance)),
    } as T);
  }
  return output.sort((left, right) => left.id.localeCompare(right.id));
}

function buildKnowledgeItems(contributions: StoredContribution[], refMap: Map<string, string>) {
  const facts: ItemCandidate<Omit<SourcedFact, keyof SourcedItem>>[] = [];
  const relations: ItemCandidate<Omit<KnowledgeRelation, keyof SourcedItem>>[] = [];
  const commitments: ItemCandidate<Omit<KnowledgeCommitment, keyof SourcedItem>>[] = [];
  const decisions: ItemCandidate<Omit<KnowledgeDecision, keyof SourcedItem>>[] = [];
  const tasks: ItemCandidate<Omit<KnowledgeTask, keyof SourcedItem>>[] = [];
  const metrics: ItemCandidate<Omit<KnowledgeMetric, keyof SourcedItem>>[] = [];

  for (const contribution of contributions) {
    const event = contribution.event;
    const source = provenance(event);
    const payload = event.payload;
    if (!payload) continue;
    for (const input of payload.facts ?? []) {
      const subjectId = resolveReference(refMap, contribution, input.subjectRef);
      const valueKey = canonicalJson(input.value);
      const logicalKey = input.key
        ? `${subjectId}|${input.predicate}|${input.key}`
        : `${subjectId}|${input.predicate}|${valueKey}|${input.validAt ?? ""}`;
      facts.push({
        logicalKey,
        exactKey: `${logicalKey}|${valueKey}`,
        observedAt: event.observedAt,
        provenance: source,
        access: normalizedAccess(event.access, input.access),
        value: {
          subjectId,
          predicate: input.predicate,
          value: input.value,
          validAt: input.validAt,
          confidence: Math.max(0, Math.min(1, input.confidence ?? 1)),
        },
      });
    }
    for (const input of payload.relations ?? []) {
      const fromId = resolveReference(refMap, contribution, input.fromRef);
      const toId = resolveReference(refMap, contribution, input.toRef);
      const logicalKey = `${fromId}|${input.type}|${toId}`;
      relations.push({
        logicalKey,
        exactKey: logicalKey,
        observedAt: event.observedAt,
        provenance: source,
        access: normalizedAccess(event.access, input.access),
        value: { fromId, toId, type: input.type, confidence: Math.max(0, Math.min(1, input.confidence ?? 1)) },
      });
    }
    for (const input of payload.commitments ?? []) {
      const ownerId = resolveReference(refMap, contribution, input.ownerRef);
      const beneficiaryId = input.beneficiaryRef
        ? resolveReference(refMap, contribution, input.beneficiaryRef)
        : undefined;
      const logicalKey = `${ownerId}|${input.key ?? normalizeText(input.action)}`;
      const value = {
        ownerId,
        beneficiaryId,
        action: input.action,
        dueAt: input.dueAt,
        status: input.status ?? "open" as const,
      };
      commitments.push({ logicalKey, exactKey: `${logicalKey}|${canonicalJson(value as unknown as JsonValue)}`, observedAt: event.observedAt, provenance: source, access: normalizedAccess(event.access, input.access), value });
    }
    for (const input of payload.decisions ?? []) {
      const subjectId = resolveReference(refMap, contribution, input.subjectRef);
      const decidedById = input.decidedByRef
        ? resolveReference(refMap, contribution, input.decidedByRef)
        : undefined;
      const logicalKey = `${subjectId}|${input.key ?? normalizeText(input.decision)}`;
      const value = {
        subjectId,
        decision: input.decision,
        decidedById,
        decidedAt: input.decidedAt,
        status: input.status ?? "approved" as const,
      };
      decisions.push({ logicalKey, exactKey: `${logicalKey}|${canonicalJson(value as unknown as JsonValue)}`, observedAt: event.observedAt, provenance: source, access: normalizedAccess(event.access, input.access), value });
    }
    for (const input of payload.tasks ?? []) {
      const subjectId = resolveReference(refMap, contribution, input.subjectRef);
      const ownerId = input.ownerRef ? resolveReference(refMap, contribution, input.ownerRef) : undefined;
      const logicalKey = `${subjectId}|${input.key ?? normalizeText(input.title)}`;
      const value = {
        subjectId,
        title: input.title,
        ownerId,
        dueAt: input.dueAt,
        status: input.status ?? "open" as const,
      };
      tasks.push({ logicalKey, exactKey: `${logicalKey}|${canonicalJson(value as unknown as JsonValue)}`, observedAt: event.observedAt, provenance: source, access: normalizedAccess(event.access, input.access), value });
    }
    for (const input of payload.metrics ?? []) {
      const subjectId = resolveReference(refMap, contribution, input.subjectRef);
      const logicalKey = `${subjectId}|${input.key ?? input.name}|${input.periodStart ?? ""}|${input.periodEnd ?? ""}`;
      const value = {
        subjectId,
        name: input.name,
        value: input.value,
        unit: input.unit,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      };
      metrics.push({ logicalKey, exactKey: `${logicalKey}|${canonicalJson(value as unknown as JsonValue)}`, observedAt: event.observedAt, provenance: source, access: normalizedAccess(event.access, input.access), value });
    }
  }

  return {
    facts: consolidate<SourcedFact>(facts, "FACT"),
    relations: consolidate<KnowledgeRelation>(relations, "REL"),
    commitments: consolidate<KnowledgeCommitment>(commitments, "COM"),
    decisions: consolidate<KnowledgeDecision>(decisions, "DEC"),
    tasks: consolidate<KnowledgeTask>(tasks, "TASK"),
    metrics: consolidate<KnowledgeMetric>(metrics, "MET"),
  };
}

function formatValue(value: JsonValue) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Intl.NumberFormat("fr-FR").format(value);
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (value === null) return "non renseigné";
  return canonicalJson(value);
}

function buildEntityNotes(
  entities: ResolvedEntity[],
  items: ReturnType<typeof buildKnowledgeItems>,
): DurableKnowledgeNote[] {
  const notes: DurableKnowledgeNote[] = [];
  for (const entity of entities) {
    const buckets = new Map<string, {
      access: KnowledgeAccess;
      facts: SourcedFact[];
      relations: KnowledgeRelation[];
      commitments: KnowledgeCommitment[];
      decisions: KnowledgeDecision[];
      tasks: KnowledgeTask[];
      metrics: KnowledgeMetric[];
    }>();
    const add = <T extends SourcedItem>(key: "facts" | "relations" | "commitments" | "decisions" | "tasks" | "metrics", item: T) => {
      const fingerprint = accessFingerprint(item.access);
      const bucket = buckets.get(fingerprint) ?? {
        access: item.access,
        facts: [],
        relations: [],
        commitments: [],
        decisions: [],
        tasks: [],
        metrics: [],
      };
      (bucket[key] as unknown as T[]).push(item);
      buckets.set(fingerprint, bucket);
    };
    items.facts.filter((item) => item.subjectId === entity.id).forEach((item) => add("facts", item));
    items.relations.filter((item) => item.fromId === entity.id || item.toId === entity.id).forEach((item) => add("relations", item));
    items.commitments.filter((item) => item.ownerId === entity.id || item.beneficiaryId === entity.id).forEach((item) => add("commitments", item));
    items.decisions.filter((item) => item.subjectId === entity.id || item.decidedById === entity.id).forEach((item) => add("decisions", item));
    items.tasks.filter((item) => item.subjectId === entity.id || item.ownerId === entity.id).forEach((item) => add("tasks", item));
    items.metrics.filter((item) => item.subjectId === entity.id).forEach((item) => add("metrics", item));

    for (const [fingerprint, bucket] of buckets) {
      const lines: string[] = [];
      if (bucket.facts.length) {
        lines.push("## Faits", ...bucket.facts.map((item) => `- ${item.predicate} : ${formatValue(item.value)}.`), "");
      }
      if (bucket.metrics.length) {
        lines.push("## Métriques", ...bucket.metrics.map((item) => `- ${item.name} : ${item.value.toLocaleString("fr-FR")} ${item.unit}.`), "");
      }
      if (bucket.commitments.length) {
        lines.push("## Engagements", ...bucket.commitments.map((item) => `- [${item.status}] ${item.action}${item.dueAt ? ` — échéance ${item.dueAt}` : ""}.`), "");
      }
      if (bucket.decisions.length) {
        lines.push("## Décisions", ...bucket.decisions.map((item) => `- [${item.status}] ${item.decision}.`), "");
      }
      if (bucket.tasks.length) {
        lines.push("## Tâches", ...bucket.tasks.map((item) => `- [${item.status}] ${item.title}${item.dueAt ? ` — ${item.dueAt}` : ""}.`), "");
      }
      if (bucket.relations.length) {
        lines.push("## Relations structurées", ...bucket.relations.map((item) => `- ${item.fromId} — ${item.type} → ${item.toId}.`), "");
      }
      const allItems = [
        ...bucket.facts,
        ...bucket.relations,
        ...bucket.commitments,
        ...bucket.decisions,
        ...bucket.tasks,
        ...bucket.metrics,
      ];
      notes.push({
        id: `NOTE-${stableHash(`${entity.id}|${fingerprint}`)}`,
        kind: "entity",
        title: `Mémoire — ${entity.displayName}`,
        summary: `${allItems.length} élément${allItems.length > 1 ? "s" : ""} durable${allItems.length > 1 ? "s" : ""} consolidé${allItems.length > 1 ? "s" : ""}.`,
        body: lines.join("\n").trim(),
        entityIds: [entity.id],
        access: bucket.access,
        provenance: dedupeProvenance(allItems.flatMap((item) => item.provenance)),
        factIds: bucket.facts.map((item) => item.id),
        relationIds: bucket.relations.map((item) => item.id),
        commitmentIds: bucket.commitments.map((item) => item.id),
        decisionIds: bucket.decisions.map((item) => item.id),
        taskIds: bucket.tasks.map((item) => item.id),
        metricIds: bucket.metrics.map((item) => item.id),
      });
    }
  }
  return notes;
}

function buildInputNotes(contributions: StoredContribution[], refMap: Map<string, string>): DurableKnowledgeNote[] {
  const candidates: ItemCandidate<{
    title: string;
    summary: string;
    body: string;
    entityIds: string[];
    topic?: string;
  }>[] = [];
  for (const contribution of contributions) {
    const event = contribution.event;
    for (const note of event.payload?.notes ?? []) {
      const entityIds = (note.entityRefs ?? []).map((ref) => resolveReference(refMap, contribution, ref));
      const value = {
        title: note.title,
        summary: note.summary,
        body: note.body?.trim() ?? "",
        entityIds: [...new Set(entityIds)].sort(),
        topic: note.topic,
      };
      candidates.push({
        logicalKey: note.key,
        exactKey: `${note.key}|${canonicalJson(value as unknown as JsonValue)}`,
        value,
        observedAt: event.observedAt,
        provenance: provenance(event),
        access: normalizedAccess(event.access, note.access),
      });
    }
  }
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const fingerprint = `${candidate.logicalKey}|${accessFingerprint(candidate.access)}`;
    const values = groups.get(fingerprint) ?? [];
    values.push(candidate);
    groups.set(fingerprint, values);
  }
  return [...groups.entries()].map(([key, values]) => {
    values.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
    const latest = values[values.length - 1];
    return {
      id: `NOTE-${stableHash(key)}`,
      kind: "topic" as const,
      title: latest.value.title,
      summary: latest.value.summary,
      body: latest.value.body,
      entityIds: latest.value.entityIds,
      topic: latest.value.topic,
      access: latest.access,
      provenance: dedupeProvenance(values.filter((item) => item.exactKey === latest.exactKey).map((item) => item.provenance)),
      factIds: [],
      relationIds: [],
      commitmentIds: [],
      decisionIds: [],
      taskIds: [],
      metricIds: [],
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function rebuild(state: KnowledgeState) {
  const contributions = Object.values(state.contributions)
    .sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  const resolved = resolveEntities(state, contributions);
  const items = buildKnowledgeItems(contributions, resolved.refMap);
  state.entities = resolved.entities;
  state.facts = items.facts;
  state.relations = items.relations;
  state.commitments = items.commitments;
  state.decisions = items.decisions;
  state.tasks = items.tasks;
  state.metrics = items.metrics;
  state.notes = [...buildEntityNotes(resolved.entities, items), ...buildInputNotes(contributions, resolved.refMap)]
    .sort((left, right) => left.id.localeCompare(right.id));
}

function validateEvent(event: KnowledgeEvent, tenantId: string) {
  if (event.tenantId !== tenantId) throw new Error(`Cross-tenant event rejected: ${event.eventId}`);
  if (!event.eventId.trim() || !event.sourceRecordId.trim() || !event.sourceVersion.trim()) {
    throw new Error("Knowledge events require eventId, sourceRecordId and sourceVersion.");
  }
  if (event.operation === "upsert" && !event.payload) {
    throw new Error(`Upsert event requires a payload: ${event.eventId}`);
  }
}

export function applyKnowledgeEvents(previous: KnowledgeState, events: KnowledgeEvent[]): KnowledgeState {
  const state = cloneState(previous);
  for (const event of events) {
    validateEvent(event, state.tenantId);
    const key = recordKey(event);
    if (state.processedEvents[event.eventId]) {
      continue;
    }
    state.processedEvents[event.eventId] = true;
    const clock = state.sourceClocks[key];
    if (compareClock(event, clock) <= 0) {
      state.journal.push({
        id: `JRN-${stableHash(`${event.eventId}|ignored_stale`)}`,
        eventId: event.eventId,
        action: "ignored_stale",
        recordKey: key,
        source: event.source,
        sourceVersion: event.sourceVersion,
        observedAt: event.observedAt,
      });
      continue;
    }
    if (event.operation === "delete") {
      delete state.contributions[key];
      state.sourceClocks[key] = {
        sourceVersion: event.sourceVersion,
        observedAt: event.observedAt,
        deleted: true,
        eventId: event.eventId,
      };
    } else {
      state.contributions[key] = { recordKey: key, event: structuredClone(event) };
      state.sourceClocks[key] = {
        sourceVersion: event.sourceVersion,
        observedAt: event.observedAt,
        deleted: false,
        eventId: event.eventId,
      };
    }
    state.journal.push({
      id: `JRN-${stableHash(`${event.eventId}|${event.operation}`)}`,
      eventId: event.eventId,
      action: event.operation,
      recordKey: key,
      source: event.source,
      sourceVersion: event.sourceVersion,
      observedAt: event.observedAt,
    });
  }
  rebuild(state);
  return state;
}

export function findEntityByIdentifier(
  state: KnowledgeState,
  scheme: EntityIdentifierInput["scheme"],
  value: string,
) {
  const key = identityKey({ scheme, value });
  const id = state.identityRegistry[key];
  return id ? state.entities.find((entity) => entity.id === id) : undefined;
}

export function knowledgeAccessFingerprint(access: KnowledgeAccess) {
  return accessFingerprint(normalizedAccess(access));
}

export function knowledgeStateDigest(state: KnowledgeState) {
  return stableHash(canonicalJson({
    tenantId: state.tenantId,
    clocks: state.sourceClocks,
    entities: state.entities,
    facts: state.facts,
    relations: state.relations,
    commitments: state.commitments,
    decisions: state.decisions,
    tasks: state.tasks,
    metrics: state.metrics,
    notes: state.notes,
    journal: state.journal,
  } as unknown as JsonValue));
}
