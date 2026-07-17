import { createHash } from "node:crypto";
import type {
  ClientRecord,
  CommitmentRecord,
  CompanyMemoryUniverse,
  Confidentiality,
  ContactRecord,
  DecisionRecord,
  DocumentRecord,
  EmailMessageRecord,
  EmailThreadRecord,
  InvoiceRecord,
  MemoryRecord,
  MemorySource,
  MeetingRecord,
  MetricDomain,
  MetricRecord,
  OpportunityRecord,
  PaymentRecord,
  ProjectRecord,
  RelationKind,
  RelationRecord,
  SourceEventRecord,
  TaskRecord,
  UniverseAggregates,
} from "@/lib/company-memory-schema";

const TENANT_ID = "ORG-ATELIER-BEAUMARCHAIS";
const DEFAULT_SEED = "atelier-beaumarchais-v1";
const DEFAULT_AS_OF = "2026-07-17T08:00:00.000Z";

const team = [
  { id: "USR-MARIE", name: "Marie Delmas", role: "Direction", email: "marie@atelier-beaumarchais.fr" },
  { id: "USR-CAMILLE", name: "Camille Laurent", role: "Développement commercial", email: "camille@atelier-beaumarchais.fr" },
  { id: "USR-THOMAS", name: "Thomas Renaud", role: "Responsable atelier", email: "thomas@atelier-beaumarchais.fr" },
  { id: "USR-INES", name: "Inès Martin", role: "Administration et finance", email: "ines@atelier-beaumarchais.fr" },
  { id: "USR-HUGO", name: "Hugo Bernard", role: "Chef de projet", email: "hugo@atelier-beaumarchais.fr" },
];

const clientSeeds = [
  ["Vitreflam", "Vitreflam SAS", "construction", "Paris", "50–99", "client"],
  ["Rivoli Développement", "Rivoli Développement SAS", "construction", "Paris", "20–49", "client"],
  ["Nova Hôtels", "Nova Hôtels Groupe", "hotel", "Paris", "100–249", "client"],
  ["Atelier Sud", "Atelier Sud Architecture", "architecture", "Marseille", "10–19", "client"],
  ["Maison Cobalt", "Maison Cobalt SAS", "retail", "Lyon", "20–49", "client"],
  ["Hôtel Orsay", "Hôtel Orsay Rive Gauche", "hotel", "Paris", "50–99", "prospect"],
  ["Studio Cime", "Studio Cime SARL", "architecture", "Annecy", "10–19", "prospect"],
  ["Maison Lenoir", "Maison Lenoir SAS", "retail", "Paris", "20–49", "prospect"],
  ["Groupe Lumen", "Groupe Lumen France", "office", "Paris", "100–249", "former-client"],
  ["Studio Marais", "Studio Marais SAS", "architecture", "Paris", "10–19", "former-client"],
  ["Hôtel Bellecour", "Hôtel Bellecour SAS", "hotel", "Lyon", "50–99", "client"],
  ["Les Jardins d’Auteuil", "Jardins d’Auteuil SAS", "hotel", "Paris", "20–49", "client"],
  ["Agence Noroît", "Agence Noroît Architecture", "architecture", "Nantes", "10–19", "client"],
  ["Cercle Montaigne", "Cercle Montaigne SAS", "office", "Paris", "50–99", "client"],
  ["Maison Atlas", "Maison Atlas Distribution", "retail", "Bordeaux", "20–49", "client"],
  ["Bureaux Opale", "Bureaux Opale SAS", "office", "Lille", "50–99", "client"],
  ["Hôtel des Arts", "Hôtel des Arts SAS", "hotel", "Paris", "20–49", "client"],
  ["Manufacture Voltaire", "Manufacture Voltaire", "retail", "Paris", "20–49", "client"],
  ["Cabinet Daumesnil", "Cabinet Daumesnil", "services", "Paris", "10–19", "client"],
  ["Galerie Ségur", "Galerie Ségur SAS", "retail", "Paris", "10–19", "client"],
  ["Hôtel Keravel", "Hôtel Keravel SAS", "hotel", "Rennes", "20–49", "client"],
  ["Agence Héméra", "Agence Héméra", "architecture", "Montpellier", "10–19", "prospect"],
  ["Bastille Cowork", "Bastille Cowork SAS", "office", "Paris", "20–49", "client"],
  ["Maison Arpège", "Maison Arpège SAS", "retail", "Toulouse", "20–49", "client"],
  ["Hôtel Saint-Paul", "Hôtel Saint-Paul SAS", "hotel", "Bordeaux", "50–99", "prospect"],
  ["Atelier Varenne", "Atelier Varenne", "architecture", "Paris", "10–19", "client"],
  ["Groupe Tilia", "Groupe Tilia SAS", "office", "Strasbourg", "100–249", "client"],
  ["Maison Solstice", "Maison Solstice SAS", "retail", "Nice", "20–49", "client"],
  ["Hôtel Canopée", "Hôtel Canopée SAS", "hotel", "Nantes", "50–99", "client"],
  ["Bureau 17", "Bureau 17 Architecture", "architecture", "Paris", "10–19", "prospect"],
] as const;

const firstNames = [
  "Fabien", "Claire", "Élodie", "Julien", "Sandrine", "Nicolas", "Laura", "Antoine", "Sophie", "Pierre",
  "Amélie", "Romain", "Louise", "Mathieu", "Sarah", "Alexandre", "Camille", "Benoît", "Céline", "Maxime",
  "Amandine", "Guillaume", "Charlotte", "Vincent", "Pauline", "Adrien", "Manon", "Jérôme", "Anaïs", "Théo",
  "Valérie", "François", "Margaux", "Olivier", "Lucie", "Damien", "Marine", "Rémi", "Alice", "Arthur",
  "Emilie", "Quentin", "Hélène", "Sébastien", "Mélanie", "Louis", "Caroline", "David", "Justine", "Simon",
  "Audrey", "Gaspard", "Noémie", "Léo", "Coralie", "Xavier", "Eva", "Martin", "Julie", "Raphaël",
];

const lastNames = [
  "Morel", "Vasseur", "Perrin", "Caron", "Lambert", "Bouvier", "Roche", "Fontaine", "Meyer", "Collet",
  "Garnier", "Lefèvre", "Bailly", "Roy", "Chevalier", "Giraud", "Masson", "Renard", "Lemoine", "Berger",
  "Barbier", "Marchand", "Brun", "Dupont", "Roux", "Leclerc", "Blanc", "Henry", "Gautier", "David",
  "Fournier", "André", "Mercier", "Roussel", "Girard", "Bonnet", "François", "Legrand", "Martel", "Rolland",
  "Boyer", "Moulin", "Paris", "Noël", "Aubert", "Picard", "Hubert", "Lacroix", "Schmitt", "Dufour",
  "Cousin", "Colin", "Arnaud", "Poirier", "Meunier", "Le Roux", "Prévost", "Delattre", "Joly", "Robin",
];

const opportunitySeeds: Array<{
  clientIndex: number;
  name: string;
  amountCents: number;
  stage: OpportunityRecord["stage"];
  probability: number;
  channel: OpportunityRecord["acquisitionChannel"];
}> = [
  { clientIndex: 6, name: "Aménagement Studio Cime", amountCents: 2_000_000, stage: "qualification", probability: 61, channel: "instagram" },
  { clientIndex: 7, name: "Mobilier Maison Lenoir", amountCents: 3_400_000, stage: "discovery", probability: 48, channel: "referral" },
  { clientIndex: 5, name: "Rénovation Hôtel Orsay", amountCents: 5_800_000, stage: "proposal", probability: 72, channel: "google-ads" },
  { clientIndex: 2, name: "Extension Nova Hôtels", amountCents: 7_200_000, stage: "negotiation", probability: 78, channel: "seo" },
  { clientIndex: 1, name: "Agencement Rivoli", amountCents: 12_000_000, stage: "won", probability: 100, channel: "referral" },
  { clientIndex: 0, name: "Automatisation des avis Vitreflam", amountCents: 1_850_000, stage: "won", probability: 100, channel: "outbound" },
  { clientIndex: 3, name: "Accueil Atelier Sud", amountCents: 4_600_000, stage: "won", probability: 100, channel: "referral" },
  { clientIndex: 4, name: "Boutique Maison Cobalt", amountCents: 3_900_000, stage: "won", probability: 100, channel: "instagram" },
  { clientIndex: 10, name: "Suites Bellecour", amountCents: 6_400_000, stage: "won", probability: 100, channel: "seo" },
  { clientIndex: 11, name: "Restaurant Auteuil", amountCents: 5_200_000, stage: "won", probability: 100, channel: "google-ads" },
  { clientIndex: 12, name: "Bibliothèque Noroît", amountCents: 2_800_000, stage: "won", probability: 100, channel: "referral" },
  { clientIndex: 13, name: "Plateau Cercle Montaigne", amountCents: 8_600_000, stage: "won", probability: 100, channel: "linkedin" },
  { clientIndex: 14, name: "Corner Maison Atlas", amountCents: 3_100_000, stage: "won", probability: 100, channel: "instagram" },
  { clientIndex: 15, name: "Accueil Bureaux Opale", amountCents: 4_400_000, stage: "lost", probability: 0, channel: "google-ads" },
  { clientIndex: 16, name: "Bar Hôtel des Arts", amountCents: 3_600_000, stage: "won", probability: 100, channel: "seo" },
  { clientIndex: 17, name: "Showroom Voltaire", amountCents: 4_900_000, stage: "won", probability: 100, channel: "instagram" },
  { clientIndex: 18, name: "Accueil Daumesnil", amountCents: 2_200_000, stage: "lost", probability: 0, channel: "outbound" },
  { clientIndex: 19, name: "Réserves Galerie Ségur", amountCents: 2_700_000, stage: "won", probability: 100, channel: "referral" },
  { clientIndex: 20, name: "Chambres Hôtel Keravel", amountCents: 5_500_000, stage: "won", probability: 100, channel: "seo" },
  { clientIndex: 22, name: "Espaces Bastille Cowork", amountCents: 7_400_000, stage: "won", probability: 100, channel: "linkedin" },
  { clientIndex: 23, name: "Collection Maison Arpège", amountCents: 3_300_000, stage: "lost", probability: 0, channel: "instagram" },
  { clientIndex: 25, name: "Atelier Varenne", amountCents: 2_600_000, stage: "won", probability: 100, channel: "referral" },
  { clientIndex: 26, name: "Siège Groupe Tilia", amountCents: 9_200_000, stage: "won", probability: 100, channel: "linkedin" },
  { clientIndex: 27, name: "Boutique Maison Solstice", amountCents: 3_800_000, stage: "lost", probability: 0, channel: "google-ads" },
  { clientIndex: 28, name: "Lobby Hôtel Canopée", amountCents: 4_700_000, stage: "won", probability: 100, channel: "seo" },
];

const financeByMonth = [
  ["2025-08", 35_400, 31.8, 71, 14_200], ["2025-09", 39_100, 32.2, 74, 12_800],
  ["2025-10", 41_600, 32.5, 76, 16_400], ["2025-11", 44_200, 33.1, 73, 13_900],
  ["2025-12", 38_900, 31.7, 69, 19_100], ["2026-01", 40_400, 32.4, 72, 15_600],
  ["2026-02", 43_700, 32.9, 75, 14_900], ["2026-03", 45_100, 33.0, 78, 12_100],
  ["2026-04", 47_800, 32.1, 74, 17_800], ["2026-05", 49_600, 31.2, 70, 18_900],
  ["2026-06", 46_300, 30.1, 68, 21_400], ["2026-07", 42_800, 29.0, 67, 24_300],
] as const;

const seoByMonth = [
  ["2025-08", 3640, 118, 3.24, 18.6, 5, 2], ["2025-09", 3880, 129, 3.32, 18.1, 6, 2],
  ["2025-10", 4210, 144, 3.42, 17.4, 7, 3], ["2025-11", 4630, 161, 3.48, 16.8, 7, 3],
  ["2025-12", 4380, 148, 3.38, 17.1, 6, 2], ["2026-01", 4920, 176, 3.58, 15.9, 8, 3],
  ["2026-02", 5280, 194, 3.67, 15.1, 9, 4], ["2026-03", 5710, 219, 3.84, 14.5, 10, 4],
  ["2026-04", 6120, 241, 3.94, 13.8, 11, 5], ["2026-05", 6590, 268, 4.07, 13.0, 12, 5],
  ["2026-06", 7140, 301, 4.22, 12.4, 13, 6], ["2026-07", 7810, 337, 4.32, 11.7, 14, 7],
] as const;

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function seededNumber(seed: string) {
  return Number.parseInt(stableHash(seed).slice(0, 8), 16) / 0xffffffff;
}

function slug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

function isoAt(date: string, hour = 8, minute = 0) {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function plusDays(date: string, days: number) {
  const value = new Date(`${date.slice(0, 10)}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysAgo(asOf: string, days: number) {
  return plusDays(asOf.slice(0, 10), -days);
}

function baseRecord(id: string, source: MemorySource, sourceId: string, occurredAt: string, seed: string, confidentiality: MemoryRecord["confidentiality"] = "internal"): MemoryRecord {
  const timestamp = occurredAt.length === 10 ? isoAt(occurredAt) : occurredAt;
  return {
    id,
    tenantId: TENANT_ID,
    createdAt: timestamp,
    updatedAt: timestamp,
    confidentiality,
    trace: {
      source,
      sourceId,
      sourceUpdatedAt: timestamp,
      ingestedAt: new Date(new Date(timestamp).getTime() + 90_000).toISOString(),
      checksum: stableHash(`${seed}:${source}:${sourceId}`).slice(0, 32),
    },
    version: 1,
    deletedAt: null,
  };
}

function relation(fromId: string, toId: string, kind: RelationKind, evidenceIds: string[], date: string, seed: string): RelationRecord {
  const id = `REL-${stableHash(`${fromId}:${kind}:${toId}`).slice(0, 12).toUpperCase()}`;
  return {
    ...baseRecord(id, "ops", id, date, seed),
    kind: "relation",
    fromId,
    toId,
    relation: kind,
    validFrom: date,
    validTo: null,
    confidence: evidenceIds.length > 0 ? 1 : 0.95,
    evidenceIds,
  };
}

function metric(id: string, domain: MetricDomain, name: string, month: string, value: number, unit: MetricRecord["unit"], source: MemorySource, seed: string, dimensions: Record<string, string> = {}, cutoffDate?: string): MetricRecord {
  const start = `${month}-01`;
  const calendarEnd = plusDays(`${month}-01`, new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate() - 1);
  const end = cutoffDate && cutoffDate >= start && cutoffDate < calendarEnd ? cutoffDate : calendarEnd;
  return {
    ...baseRecord(id, source, id, isoAt(end, 7, 50), seed),
    kind: "metric",
    domain,
    metric: name,
    periodStart: start,
    periodEnd: end,
    value,
    unit,
    dimensions,
  };
}

export type UniverseOptions = { seed?: string; asOf?: string };

export function generateAtelierBeaumarchaisUniverse(options: UniverseOptions = {}): CompanyMemoryUniverse {
  const seed = options.seed ?? DEFAULT_SEED;
  const asOf = options.asOf ?? DEFAULT_AS_OF;
  const clients: ClientRecord[] = clientSeeds.map(([name, legalName, segment, city, employeeRange, status], index) => {
    const id = `CLT-${slug(name)}`;
    const created = daysAgo(asOf, 360 - index * 7);
    return {
      ...baseRecord(id, "twenty", `company_${String(index + 1).padStart(4, "0")}`, created, seed),
      kind: "client",
      name,
      legalName,
      segment,
      city,
      employeeRange,
      status,
      healthScore: status === "former-client" ? 58 : status === "prospect" ? 66 : 76 + (index % 17),
      accountOwnerId: index % 3 === 0 ? "USR-MARIE" : "USR-CAMILLE",
      tags: [segment, city.toLocaleLowerCase("fr"), status],
    };
  });

  const contacts: ContactRecord[] = clients.flatMap((client, clientIndex) => [0, 1].map((offset) => {
    const personIndex = clientIndex * 2 + offset;
    const firstName = firstNames[personIndex];
    const lastName = lastNames[personIndex];
    const id = `PER-${slug(firstName)}-${slug(lastName)}`;
    const created = plusDays(client.createdAt.slice(0, 10), 1 + offset);
    return {
      ...baseRecord(id, "twenty", `person_${String(personIndex + 1).padStart(4, "0")}`, created, seed),
      kind: "contact",
      clientId: client.id,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      role: offset === 0 ? (client.segment === "hotel" ? "Directeur général" : "Dirigeant") : (client.segment === "architecture" ? "Chef de projet" : "Responsable opérations"),
      email: `${slug(firstName).toLocaleLowerCase("fr")}.${slug(lastName).toLocaleLowerCase("fr")}@${slug(client.name).toLocaleLowerCase("fr")}.example`,
      phone: `+33 6 ${String(10 + clientIndex).padStart(2, "0")} ${String(20 + offset).padStart(2, "0")} ${String(30 + clientIndex % 20).padStart(2, "0")} ${String(40 + offset).padStart(2, "0")}`,
      isDecisionMaker: offset === 0,
      preferredChannel: offset === 0 ? "email" : clientIndex % 2 === 0 ? "phone" : "linkedin",
    };
  }));

  const opportunities: OpportunityRecord[] = opportunitySeeds.map((item, index) => {
    const client = clients[item.clientIndex];
    const closeDate = item.stage === "won" || item.stage === "lost" ? daysAgo(asOf, 35 + index * 9) : plusDays(asOf.slice(0, 10), 12 + index * 3);
    const id = index < 4 ? `OPP-${403 - index}` : `OPP-${String(410 + index).padStart(3, "0")}`;
    return {
      ...baseRecord(id, "twenty", `opportunity_${String(index + 1).padStart(4, "0")}`, daysAgo(asOf, 280 - index * 6), seed),
      kind: "opportunity",
      clientId: client.id,
      primaryContactId: contacts[item.clientIndex * 2].id,
      name: item.name,
      amountCents: item.amountCents,
      probability: item.probability,
      stage: item.stage,
      expectedCloseDate: closeDate,
      ownerId: index % 4 === 0 ? "USR-MARIE" : "USR-CAMILLE",
      acquisitionChannel: item.channel,
      nextStep: item.stage === "lost" ? "Archiver le retour d’expérience" : item.stage === "won" ? "Suivre la livraison" : ["Qualifier le besoin", "Planifier la visite technique", "Finaliser le chiffrage", "Obtenir l’arbitrage budget"][index],
      lostReason: item.stage === "lost" ? ["Budget reporté", "Délai incompatible", "Concurrent historique", "Périmètre réduit"][index % 4] : null,
    };
  });

  const projectOpportunityIndexes = [5, 4, 7, 6, 8, 9, 10, 11, 12, 14, 15, 18];
  const projectNames = [
    "Automatisation des avis", "Rivoli · agencement atelier", "Maison Cobalt · boutique", "Atelier Sud · accueil",
    "Bellecour · suites", "Auteuil · restaurant", "Noroît · bibliothèque", "Montaigne · plateau direction",
    "Atlas · corner", "Hôtel des Arts · bar", "Voltaire · showroom", "Galerie Ségur · réserves",
  ];
  const projects: ProjectRecord[] = projectOpportunityIndexes.map((opportunityIndex, index) => {
    const opportunity = opportunities[opportunityIndex];
    const isRivoli = index === 1;
    const startDate = daysAgo(asOf, 120 - index * 5);
    const id = isRivoli ? "PROJET-241" : `PRJ-${String(301 + index).padStart(3, "0")}`;
    const budget = opportunity.amountCents;
    const costBudget = Math.round(budget * 0.69);
    const costActual = isRivoli ? Math.round(budget * 0.711) : Math.round(costBudget * (0.54 + index * 0.025));
    return {
      ...baseRecord(id, "notion", `project_${String(index + 1).padStart(4, "0")}`, startDate, seed, index === 0 ? "restricted" : "internal"),
      kind: "project",
      clientId: opportunity.clientId,
      opportunityId: opportunity.id,
      name: projectNames[index],
      status: isRivoli ? "at-risk" : index < 7 ? "active" : index < 10 ? "planned" : "completed",
      startDate,
      targetDate: plusDays(startDate, 90 + index * 3),
      budgetCents: budget,
      recognizedRevenueCents: Math.round(budget * (isRivoli ? 0.62 : Math.min(0.94, 0.42 + index * 0.055))),
      costBudgetCents: costBudget,
      costActualCents: costActual,
      progressPercent: isRivoli ? 62 : Math.min(100, 38 + index * 6),
      ownerId: index % 2 === 0 ? "USR-HUGO" : "USR-THOMAS",
      teamMemberIds: index % 2 === 0 ? ["USR-HUGO", "USR-THOMAS"] : ["USR-THOMAS", "USR-INES"],
      riskSummary: isRivoli ? "14 heures non facturées et placage chêne au-dessus du budget ; avenant de 6,8 K€ à valider." : index === 0 ? "Le lien de connexion Trustpilot transmis à Fabien ne fonctionne pas." : null,
    };
  });

  const documents: DocumentRecord[] = [];
  clients.forEach((client, clientIndex) => {
    const project = projects.find((item) => item.clientId === client.id) ?? null;
    ["contract", "quote", "report", "procedure"].forEach((documentType, offset) => {
      const id = `DOC-${String(clientIndex + 1).padStart(2, "0")}-${String(offset + 1).padStart(2, "0")}`;
      const titleByType = {
        contract: `Contrat cadre · ${client.name}`,
        quote: `Proposition commerciale · ${client.name}`,
        report: `Revue de compte · ${client.name}`,
        procedure: `Procédure de suivi · ${client.name}`,
      } as const;
      documents.push({
        ...baseRecord(id, "drive", `drive_${String(clientIndex * 4 + offset + 1).padStart(5, "0")}`, daysAgo(asOf, 300 - clientIndex * 6 - offset), seed, documentType === "contract" ? "restricted" : "internal"),
        kind: "document",
        clientId: client.id,
        projectId: project?.id ?? null,
        title: titleByType[documentType as keyof typeof titleByType],
        documentType: documentType as DocumentRecord["documentType"],
        mimeType: documentType === "procedure" ? "text/markdown" : "application/pdf",
        storageKey: `${TENANT_ID}/${slug(client.name)}/${id}.${documentType === "procedure" ? "md" : "pdf"}`,
        sizeBytes: 42_000 + clientIndex * 913 + offset * 6_731,
        sha256: stableHash(`${seed}:document:${id}`),
        summary: documentType === "report" ? `Synthèse datée du compte ${client.name}, de ses affaires, engagements et points de vigilance.` : `${titleByType[documentType as keyof typeof titleByType]} validé et relié à la fiche client.`,
      });
    });

    const opportunity = opportunities.find((item) => item.clientId === client.id) ?? null;
    const accountPlanId = `NTN-COMPTE-${String(clientIndex + 1).padStart(3, "0")}`;
    documents.push({
      ...baseRecord(
        accountPlanId,
        "notion",
        `account_plan_${String(clientIndex + 1).padStart(4, "0")}`,
        daysAgo(asOf, 42 - (clientIndex % 9)),
        seed,
      ),
      kind: "document",
      clientId: client.id,
      projectId: project?.id ?? null,
      title: `Plan de compte · ${client.name}`,
      documentType: "report",
      mimeType: "text/markdown",
      storageKey: `${TENANT_ID}/${slug(client.name)}/notion/plan-de-compte.md`,
      sizeBytes: 7_800 + clientIndex * 137,
      sha256: stableHash(`${seed}:notion-account-plan:${client.id}`),
      summary: [
        `${client.name} est suivi comme ${client.status === "client" ? "client actif" : client.status === "prospect" ? "prospect" : "ancien client"}, avec un score de santé de ${client.healthScore}/100.`,
        project ? `Le projet ${project.name} est à ${project.progressPercent} % et son prochain jalon est fixé au ${project.targetDate}.` : "Aucun projet actif n’est rattaché au compte.",
        opportunity ? `L’affaire ${opportunity.name} représente ${(opportunity.amountCents / 100).toLocaleString("fr-FR")} € avec une probabilité de ${opportunity.probability} % ; prochaine étape : ${opportunity.nextStep}.` : "La prochaine action consiste à qualifier un nouveau besoin et à vérifier les engagements encore ouverts.",
      ].join(" "),
    });

    ["commercial", "operations"].forEach((channel, channelIndex) => {
      const slackId = `SLK-${String(clientIndex + 1).padStart(3, "0")}-${channelIndex + 1}`;
      const slackDaysAgo = (clientIndex + channelIndex) % 8;
      const summary = channel === "commercial"
        ? opportunity
          ? `Échanges de l’équipe commerciale sur ${client.name} : ${opportunity.name} reste en phase ${opportunity.stage}, pour ${(opportunity.amountCents / 100).toLocaleString("fr-FR")} €. L’équipe confirme la prochaine étape « ${opportunity.nextStep} » et demande de centraliser le prochain retour client dans le CRM.`
          : `Échanges de l’équipe commerciale sur ${client.name} : le compte doit être réactivé avec un message contextualisé à partir du dernier projet, sans lancer de relance externe avant validation.`
        : project
          ? `Échanges de l’équipe opérations sur ${client.name} : ${project.name} est à ${project.progressPercent} %. ${project.riskSummary ?? `Le planning reste aligné sur l’échéance du ${project.targetDate}, avec un contrôle des tâches et pièces manquantes au prochain point.`}`
          : `Échanges de l’équipe opérations sur ${client.name} : aucune charge atelier n’est encore réservée. L’équipe attend un périmètre validé avant d’engager des ressources.`;
      documents.push({
        ...baseRecord(
          slackId,
          "slack",
          `thread_${channel}_${String(clientIndex + 1).padStart(4, "0")}`,
          isoAt(daysAgo(asOf, slackDaysAgo), slackDaysAgo === 0 ? 7 : 9 + channelIndex * 5, 18),
          seed,
        ),
        kind: "document",
        clientId: client.id,
        projectId: project?.id ?? null,
        title: `Synthèse Slack · #${channel} · ${client.name}`,
        documentType: "meeting-notes",
        mimeType: "text/markdown",
        storageKey: `${TENANT_ID}/${slug(client.name)}/slack/${channel}.md`,
        sizeBytes: 3_600 + clientIndex * 83 + channelIndex * 419,
        sha256: stableHash(`${seed}:slack:${client.id}:${channel}`),
        summary,
      });
    });
  });

  const decisions: DecisionRecord[] = [];
  clients.forEach((client, clientIndex) => {
    const project = projects.find((item) => item.clientId === client.id) ?? null;
    const titles = project?.id === "PROJET-241"
      ? ["Préparer l’avenant Rivoli de 6,8 K€", "Renforcer l’atelier pendant trois jours", "Refacturer les heures hors périmètre", "Suivre le placage chêne chaque semaine"]
      : client.name === "Vitreflam"
        ? ["Renvoyer un accès Trustpilot fonctionnel", "Centraliser les demandes d’avis", "Valider les réponses sans commentaire", "Mesurer le taux de publication chaque vendredi"]
        : ["Confirmer le périmètre de livraison", "Maintenir le point hebdomadaire", "Valider le budget complémentaire", "Documenter la réception finale"];
    titles.forEach((title, offset) => {
      const id = project?.id === "PROJET-241" && offset === 0
        ? "VAL-063"
        : project?.id === "PROJET-241" && offset === 1
          ? "DEC-058"
          : client.name === "Nova Hôtels" && offset === 0
            ? "VAL-061"
            : `DEC-GEN-${String(clientIndex * 4 + offset + 1).padStart(3, "0")}`;
      const decidedOn = daysAgo(asOf, 95 - clientIndex * 2 - offset * 4);
      decisions.push({
        ...baseRecord(id, "notion", `decision_${String(clientIndex * 4 + offset + 1).padStart(5, "0")}`, decidedOn, seed),
        kind: "decision",
        clientId: client.id,
        projectId: project?.id ?? null,
        title: id === "VAL-061" ? "Relancer Atelier Sud et Nova Hôtels pour 20,2 K€" : title,
        decidedOn,
        decidedByIds: offset % 2 === 0 ? ["USR-MARIE", "USR-HUGO"] : ["USR-MARIE", "USR-CAMILLE"],
        rationale: project?.id === "PROJET-241" && offset === 0
          ? "L’avenant protège 1,9 point de marge et couvre le périmètre réellement demandé."
          : id === "VAL-061"
            ? "Atelier Sud dépasse son délai de 28 jours et Nova Hôtels de 12 jours ; les deux relances sont validées, Maison Cobalt attend lundi."
            : `Décision prise à partir du dernier point de suivi ${client.name} et des engagements ouverts.`,
        outcome: offset < 2 ? "Action lancée avec un contrôle à sept jours." : "Décision enregistrée, responsable et échéance attribués.",
        status: offset === 3 && clientIndex % 4 === 0 ? "superseded" : offset === 0 ? "active" : "completed",
        sourceMeetingId: null,
      });
    });
  });

  const tasks: TaskRecord[] = [];
  clients.forEach((client, clientIndex) => {
    const project = projects.find((item) => item.clientId === client.id) ?? null;
    const opportunity = opportunities.find((item) => item.clientId === client.id) ?? null;
    const taskTitles = client.name === "Vitreflam"
      ? ["Tester le lien Trustpilot", "Répondre à Fabien", "Mettre à jour la procédure d’accès", "Contrôler les avis publiés", "Préparer le point client", "Rassembler les erreurs de connexion", "Valider le modèle de réponse", "Mesurer le taux de traitement"]
      : ["Relire le dernier compte rendu", "Confirmer la prochaine échéance", "Mettre à jour le budget", "Préparer le point client", "Classer les pièces reçues", "Vérifier les engagements ouverts", "Actualiser le planning", "Envoyer le récapitulatif"];
    taskTitles.forEach((title, offset) => {
      const decision = decisions[clientIndex * 4 + (offset % 4)];
      const id = `TSK-${String(clientIndex * 8 + offset + 1).padStart(4, "0")}`;
      const dueOn = plusDays(asOf.slice(0, 10), -18 + ((clientIndex * 3 + offset * 4) % 45));
      const status: TaskRecord["status"] = dueOn < asOf.slice(0, 10) ? (offset % 5 === 0 ? "blocked" : "done") : offset % 3 === 0 ? "in-progress" : "todo";
      tasks.push({
        ...baseRecord(id, "notion", `task_${String(clientIndex * 8 + offset + 1).padStart(5, "0")}`, daysAgo(asOf, 50 - offset * 3), seed),
        kind: "task",
        clientId: client.id,
        projectId: project?.id ?? null,
        opportunityId: opportunity?.id ?? null,
        title,
        description: `${title} pour ${client.name}, avec vérification de la source avant clôture.`,
        ownerId: ["USR-MARIE", "USR-CAMILLE", "USR-HUGO", "USR-THOMAS", "USR-INES"][(clientIndex + offset) % 5],
        dueOn,
        priority: offset === 0 || status === "blocked" ? "high" : offset % 3 === 0 ? "normal" : "low",
        status,
        sourceDecisionId: decision.id,
        completedAt: status === "done" ? isoAt(plusDays(dueOn, -1), 16, 30) : null,
      });
    });
  });

  const meetings: MeetingRecord[] = [];
  clients.forEach((client, clientIndex) => {
    const contactIds = contacts.filter((item) => item.clientId === client.id).map((item) => item.id);
    const project = projects.find((item) => item.clientId === client.id) ?? null;
    [0, 1].forEach((offset) => {
      const id = `MEET-${String(clientIndex * 2 + offset + 1).padStart(3, "0")}`;
      const date = daysAgo(asOf, 120 - (clientIndex % 10) * 4 - offset * 30);
      const documentId = `DOC-MEET-${String(clientIndex * 2 + offset + 1).padStart(3, "0")}`;
      const decisionIds = [decisions[clientIndex * 4 + offset * 2].id, decisions[clientIndex * 4 + offset * 2 + 1].id];
      const taskIds = [tasks[clientIndex * 8 + offset * 4].id, tasks[clientIndex * 8 + offset * 4 + 1].id];
      meetings.push({
        ...baseRecord(id, "calendar", `event_${String(clientIndex * 2 + offset + 1).padStart(5, "0")}`, isoAt(date, 9 + offset * 5, 30), seed),
        kind: "meeting",
        clientId: client.id,
        projectId: project?.id ?? null,
        title: offset === 0 ? `Point de pilotage · ${client.name}` : `Revue d’avancement · ${client.name}`,
        startsAt: isoAt(date, 9 + offset * 5, 30),
        durationMinutes: offset === 0 ? 45 : 30,
        participantIds: [...contactIds, "USR-MARIE", project ? "USR-HUGO" : "USR-CAMILLE"],
        summary: client.name === "Vitreflam" && offset === 1 ? "Fabien confirme que le lien de connexion Trustpilot ne fonctionne pas. Marie promet un nouvel accès testé avant le 18 juillet." : `Le point confirme le périmètre, l’échéance suivante et les deux actions attribuées pour ${client.name}.`,
        decisionIds,
        taskIds,
        transcriptDocumentId: documentId,
      });
      documents.push({
        ...baseRecord(documentId, "drive", `transcript_${String(clientIndex * 2 + offset + 1).padStart(5, "0")}`, isoAt(date, 10 + offset * 5, 20), seed),
        kind: "document",
        clientId: client.id,
        projectId: project?.id ?? null,
        title: `Compte rendu · ${client.name} · ${date}`,
        documentType: "meeting-notes",
        mimeType: "text/markdown",
        storageKey: `${TENANT_ID}/${slug(client.name)}/reunions/${date}.md`,
        sizeBytes: 8_400 + clientIndex * 173 + offset * 911,
        sha256: stableHash(`${seed}:transcript:${id}`),
        summary: client.name === "Vitreflam" && offset === 1 ? "Incident de connexion Trustpilot, engagement de renvoi et contrôle du lien avant transmission." : `Décisions, tâches et engagements du point ${client.name}.`,
      });
      for (const decisionId of decisionIds) {
        const decision = decisions.find((item) => item.id === decisionId);
        if (decision) decision.sourceMeetingId = id;
      }
    });
  });

  const threadSubjects = ["Suivi du projet", "Validation du planning", "Documents à compléter", "Point budget", "Préparation de la réunion", "Réception et prochaines étapes"];
  const emailThreads: EmailThreadRecord[] = [];
  const emailMessages: EmailMessageRecord[] = [];
  clients.forEach((client, clientIndex) => {
    const clientContacts = contacts.filter((item) => item.clientId === client.id);
    const project = projects.find((item) => item.clientId === client.id) ?? null;
    const opportunity = opportunities.find((item) => item.clientId === client.id) ?? null;
    for (let threadIndex = 0; threadIndex < 6; threadIndex += 1) {
      const threadId = `THR-${String(clientIndex * 6 + threadIndex + 1).padStart(4, "0")}`;
      const specialTrustpilot = client.name === "Vitreflam" && threadIndex === 0;
      const subject = specialTrustpilot ? "Demande concernant Trustpilot" : `${threadSubjects[threadIndex]} · ${client.name}`;
      // Onze conversations se terminent par un email entrant la veille du
      // snapshot. Elles alimentent la boîte du dirigeant et les comparatifs
      // quotidiens sans créer une note Obsidian pour chaque message.
      const recentInboxThread = specialTrustpilot || (threadIndex === 5 && clientIndex < 10);
      const firstDay = recentInboxThread
        ? daysAgo(asOf, 13)
        : daysAgo(asOf, 320 - clientIndex * 6 - threadIndex * 13);
      const messageIds: string[] = [];
      for (let messageIndex = 0; messageIndex < 7; messageIndex += 1) {
        const id = `EMAIL-${String((clientIndex * 6 + threadIndex) * 7 + messageIndex + 1).padStart(5, "0")}`;
        const inbound = messageIndex % 2 === 0;
        const contact = clientContacts[messageIndex % clientContacts.length];
        const sentOn = plusDays(firstDay, messageIndex * 2);
        const priorId = messageIndex === 0 ? null : messageIds[messageIds.length - 1];
        let text: string;
        let intent: EmailMessageRecord["extractedIntent"];
        let requiresAction = inbound;
        if (specialTrustpilot) {
          const trustpilotMessages = [
            "Bonjour Marie, le lien de connexion Trustpilot que vous m’avez envoyé ne fonctionne pas. Pouvez-vous vérifier ? Merci, Fabien.",
            "Bonjour Fabien, merci pour le signalement. Je teste l’accès et je vous renvoie un lien vérifié aujourd’hui.",
            "Merci. Nous devons publier les réponses aux avis de la semaine avant vendredi, ce point est donc prioritaire.",
            "Bien reçu. J’ai demandé un nouveau lien et ajouté un contrôle en navigation privée avant tout nouvel envoi.",
            "Le second lien ouvre la page mais demande encore un code qui n’arrive pas. Je vous joins la capture.",
            "Je m’en occupe avec le support Trustpilot. Je vous confirme un accès complet demain avant 11 h.",
            "Parfait. Nous attendons votre confirmation avant de reprendre l’automatisation des avis.",
          ];
          text = trustpilotMessages[messageIndex];
          intent = ["problem", "follow-up", "question", "update", "problem", "decision", "approval"][messageIndex] as EmailMessageRecord["extractedIntent"];
          requiresAction = [true, false, true, false, true, false, true][messageIndex];
        } else {
          const latestInboxByClient: Record<string, string> = {
            "Vitreflam": "Bonjour Marie, le support Trustpilot confirme que le nouvel accès est activé. Pouvez-vous me renvoyer le lien testé avant 11 h et confirmer la reprise des réponses aux avis ?",
            "Rivoli Développement": "Bonjour Marie, nous pouvons valider l’avenant de 6 800 € aujourd’hui si le détail des 14 heures et du placage chêne figure dans le document final.",
            "Nova Hôtels": "Bonjour, le budget de l’extension passe en arbitrage lundi. Merci de nous envoyer avant vendredi une version à 72 000 € avec les deux variantes de finition.",
            "Atelier Sud": "Bonjour Marie, notre comptabilité a programmé le virement de 12 400 € pour demain. Pouvez-vous nous confirmer l’IBAN et suspendre la relance automatique ?",
            "Maison Cobalt": "Bonjour, le directeur financier sera de retour lundi. Merci de ne pas relancer avant son arbitrage ; je vous confirme le calendrier de paiement à 10 h.",
            "Hôtel Orsay": "Bonjour Camille, la direction valide le principe du projet. Pouvez-vous nous transmettre le chiffrage final de 58 000 € et trois créneaux de visite technique ?",
            "Studio Cime": "Bonjour, les plans définitifs sont joints. Nous souhaitons un point de 25 minutes demain sur l’enveloppe de 20 000 € et le planning de pose.",
            "Groupe Lumen": "Bonjour Marie, votre message arrive au bon moment : nous rouvrons le programme d’agencement de nos bureaux. Pouvez-vous proposer un rendez-vous la semaine prochaine ?",
            "Studio Marais": "Bonjour Camille, nous préparons deux nouveaux espaces pour septembre. Merci de reprendre les prix du dernier chantier et d’indiquer les délais actuels.",
            "Maison Lenoir": "Bonjour Marie, la visite technique de vendredi est confirmée à 9 h 30. Pouvez-vous venir avec les échantillons chêne clair et le relevé des contraintes ?",
          };
          const inboundTexts = [
            `Bonjour, voici notre retour sur ${subject.toLocaleLowerCase("fr")}. Pouvez-vous confirmer l’échéance et le responsable ?`,
            `Nous avons vérifié les éléments pour ${client.name}. Un point reste à clarifier avant validation définitive.`,
            `La direction valide le principe. Merci de conserver une trace de la décision et de la prochaine étape.`,
            `Pouvez-vous nous transmettre le récapitulatif à jour avec les éventuels écarts de coût ou de délai ?`,
          ];
          const outboundTexts = [
            `Bonjour ${contact.firstName}, merci pour votre retour. Nous mettons à jour le dossier et revenons vers vous avec une réponse sourcée.`,
            `Le planning et le budget ont été rapprochés. La prochaine étape reste confirmée et aucun nouveau risque n’est identifié.`,
            `Votre validation est enregistrée. Le compte rendu, les tâches et l’échéance ont été reliés au dossier ${client.name}.`,
          ];
          const latestInbox = recentInboxThread && messageIndex === 6
            ? latestInboxByClient[client.name]
            : undefined;
          text = latestInbox ?? (inbound ? inboundTexts[Math.floor(messageIndex / 2) % inboundTexts.length] : outboundTexts[Math.floor(messageIndex / 2) % outboundTexts.length]);
          intent = latestInbox ? "follow-up" : inbound ? (["question", "update", "approval", "follow-up"] as const)[Math.floor(messageIndex / 2) % 4] : "update";
        }
        const sentAt = isoAt(sentOn, 8 + messageIndex, Math.round(seededNumber(`${seed}:${id}`) * 50));
        messageIds.push(id);
        emailMessages.push({
          ...baseRecord(id, "gmail", `gmail_${String((clientIndex * 6 + threadIndex) * 7 + messageIndex + 1).padStart(6, "0")}`, sentAt, seed, specialTrustpilot ? "restricted" : "internal"),
          kind: "email-message",
          threadId,
          clientId: client.id,
          projectId: project?.id ?? null,
          sender: inbound ? contact.email : messageIndex % 3 === 0 ? team[0].email : team[1].email,
          recipients: inbound ? [team[messageIndex % 3].email] : [contact.email],
          sentAt,
          subject,
          text,
          direction: inbound ? "inbound" : "outbound",
          inReplyToId: priorId,
          attachmentDocumentIds: messageIndex === 4 ? [documents[clientIndex * 4 + 2].id] : [],
          extractedIntent: intent,
          requiresAction,
        });
      }
      const threadMessages = emailMessages.filter((item) => item.threadId === threadId);
      emailThreads.push({
        ...baseRecord(threadId, "gmail", `gmail_thread_${String(clientIndex * 6 + threadIndex + 1).padStart(5, "0")}`, threadMessages[0].sentAt, seed, specialTrustpilot ? "restricted" : "internal"),
        kind: "email-thread",
        clientId: client.id,
        contactIds: clientContacts.map((item) => item.id),
        subject,
        projectId: project?.id ?? null,
        opportunityId: opportunity?.id ?? null,
        messageIds,
        lastMessageAt: threadMessages.at(-1)?.sentAt ?? threadMessages[0].sentAt,
        status: specialTrustpilot ? "waiting-us" : ["active", "waiting-client", "waiting-us", "closed"][threadIndex % 4] as EmailThreadRecord["status"],
        extractedSummary: specialTrustpilot ? "Fabien signale deux échecs de connexion Trustpilot. OPS a promis un accès testé avant la reprise de l’automatisation des avis." : `Échange structuré sur ${subject.toLocaleLowerCase("fr")}, avec validation, échéance et prochaine action identifiées.`,
      });
    }
  });

  const invoices: InvoiceRecord[] = [];
  const payments: PaymentRecord[] = [];
  const outstandingByClient = new Map<string, { total: number; status: InvoiceRecord["status"]; issuedAgo: number; dueAgo: number }>([
    [clients[3].id, { total: 1_240_000, status: "overdue", issuedAgo: 58, dueAgo: 28 }],
    [clients[2].id, { total: 780_000, status: "overdue", issuedAgo: 42, dueAgo: 12 }],
    [clients[4].id, { total: 410_000, status: "due", issuedAgo: 38, dueAgo: 8 }],
  ]);
  clients.forEach((client, clientIndex) => {
    const project = projects.find((item) => item.clientId === client.id) ?? null;
    for (let invoiceIndex = 0; invoiceIndex < 6; invoiceIndex += 1) {
      const specialInvoiceId = invoiceIndex === 5
        ? client.id === clients[3].id ? "FACT-879"
          : client.id === clients[2].id ? "FACT-886"
            : client.id === clients[4].id ? "FACT-890"
              : null
        : client.id === clients[1].id && invoiceIndex === 2 ? "FACT-882" : null;
      const id = specialInvoiceId ?? `FACT-GEN-${String(clientIndex * 6 + invoiceIndex + 1).padStart(4, "0")}`;
      const special = invoiceIndex === 5 ? outstandingByClient.get(client.id) : undefined;
      const issuedOn = special ? daysAgo(asOf, special.issuedAgo) : daysAgo(asOf, 320 - invoiceIndex * 45 - (clientIndex % 6) * 7);
      const dueOn = special ? daysAgo(asOf, special.dueAgo) : plusDays(issuedOn, 30);
      const amountIncludingTaxCents = special?.total ?? 240_000 + clientIndex * 17_500 + invoiceIndex * 64_000;
      const amountExcludingTaxCents = Math.round(amountIncludingTaxCents / 1.2);
      const paid = special ? 0 : amountIncludingTaxCents;
      invoices.push({
        ...baseRecord(id, "pennylane", `invoice_${String(clientIndex * 6 + invoiceIndex + 1).padStart(5, "0")}`, issuedOn, seed, "restricted"),
        kind: "invoice",
        clientId: client.id,
        projectId: project?.id ?? null,
        invoiceNumber: `AB-${issuedOn.slice(0, 4)}-${String(clientIndex * 6 + invoiceIndex + 1).padStart(4, "0")}`,
        issuedOn,
        dueOn,
        amountExcludingTaxCents,
        taxCents: amountIncludingTaxCents - amountExcludingTaxCents,
        amountIncludingTaxCents,
        paidCents: paid,
        status: special?.status ?? "paid",
      });
      if (!special) {
        const paymentId = `PAY-${String(clientIndex * 6 + invoiceIndex + 1).padStart(4, "0")}`;
        const paidOn = plusDays(issuedOn, 18 + ((clientIndex + invoiceIndex) % 11));
        payments.push({
          ...baseRecord(paymentId, "pennylane", `payment_${String(clientIndex * 6 + invoiceIndex + 1).padStart(5, "0")}`, paidOn, seed, "restricted"),
          kind: "payment",
          clientId: client.id,
          invoiceId: id,
          paidOn,
          amountCents: amountIncludingTaxCents,
          method: invoiceIndex % 5 === 0 ? "direct-debit" : "bank-transfer",
          bankReference: `VIR-AB-${stableHash(`${seed}:${paymentId}`).slice(0, 10).toUpperCase()}`,
        });
      }
    }
  });

  const commitments: CommitmentRecord[] = [];
  clients.forEach((client, clientIndex) => {
    const project = projects.find((item) => item.clientId === client.id) ?? null;
    const clientContacts = contacts.filter((item) => item.clientId === client.id);
    for (let offset = 0; offset < 4; offset += 1) {
      const id = `COM-${String(clientIndex * 4 + offset + 1).padStart(3, "0")}`;
      const evidenceMeeting = offset % 2 === 1;
      const meeting = meetings[clientIndex * 2 + (offset % 2)];
      const email = emailMessages[(clientIndex * 6 + (offset % 6)) * 7 + 5];
      const description = client.name === "Vitreflam" && offset === 0
        ? "Envoyer à Fabien un lien Trustpilot testé en navigation privée avant le 18 juillet à 11 h."
        : ["Transmettre le récapitulatif validé", "Confirmer la prochaine échéance", "Documenter la décision", "Clore le point budgétaire"][offset] + ` pour ${client.name}.`;
      const dueOn = client.name === "Vitreflam" && offset === 0 ? "2026-07-18" : plusDays(asOf.slice(0, 10), -10 + ((clientIndex + offset * 3) % 28));
      commitments.push({
        ...baseRecord(id, "ops", id, daysAgo(asOf, 35 - offset * 5), seed),
        kind: "commitment",
        clientId: client.id,
        contactId: clientContacts[offset % 2].id,
        projectId: project?.id ?? null,
        description,
        committedBy: offset % 3 === 0 ? "company" : "client",
        committedOn: daysAgo(asOf, 35 - offset * 5),
        dueOn,
        status: dueOn < asOf.slice(0, 10) ? (offset % 3 === 0 ? "late" : "kept") : "open",
        evidenceType: evidenceMeeting ? "meeting" : "email",
        evidenceId: evidenceMeeting ? meeting.id : email.id,
      });
    }
  });

  const metrics: MetricRecord[] = [];
  financeByMonth.forEach(([month, revenue, margin, cashDays, receivables], index) => {
    metrics.push(
      metric(`FIN-CA-${month}`, "finance", "revenue", month, revenue, "EUR", "pennylane", seed, {}, asOf.slice(0, 10)),
      metric(`FIN-MARGE-${month}`, "finance", "gross_margin", month, margin, "percent", "pennylane", seed, {}, asOf.slice(0, 10)),
      metric(`FIN-CASH-${month}`, "finance", "cash_visibility", month, cashDays, "days", "pennylane", seed, {}, asOf.slice(0, 10)),
      metric(`FIN-CREANCES-${month}`, "finance", "outstanding_receivables", month, receivables, "EUR", "pennylane", seed, {}, asOf.slice(0, 10)),
      metric(`FIN-FACTURES-${month}`, "finance", "invoice_count", month, 12 + (index % 7), "count", "pennylane", seed, {}, asOf.slice(0, 10)),
    );
  });
  seoByMonth.forEach(([month, impressions, clicks, ctr, position, leads, conversions]) => {
    metrics.push(
      metric(`SEO-IMP-${month}`, "seo", "impressions", month, impressions, "count", "google-search-console", seed, {}, asOf.slice(0, 10)),
      metric(`SEO-CLICK-${month}`, "seo", "clicks", month, clicks, "count", "google-search-console", seed, {}, asOf.slice(0, 10)),
      metric(`SEO-CTR-${month}`, "seo", "ctr", month, ctr, "percent", "google-search-console", seed, {}, asOf.slice(0, 10)),
      metric(`SEO-POS-${month}`, "seo", "average_position", month, position, "position", "google-search-console", seed, {}, asOf.slice(0, 10)),
      metric(`SEO-LEADS-${month}`, "seo", "qualified_leads", month, leads, "count", "google-search-console", seed, {}, asOf.slice(0, 10)),
      metric(`SEO-CONV-${month}`, "seo", "conversions", month, conversions, "count", "google-search-console", seed, {}, asOf.slice(0, 10)),
    );
  });
  financeByMonth.forEach(([month], monthIndex) => {
    const channelSpecs: Array<[MetricDomain, MemorySource, number, number, number]> = [
      ["google-ads", "google-ads", 520 + monthIndex * 15, 7 + Math.floor(monthIndex / 2), 31_000 + monthIndex * 2_450],
      ["meta-ads", "meta-ads", 260 + monthIndex * 4, 2 + (monthIndex % 3), 4_000 + monthIndex * 520],
      ["instagram", "instagram", 0, 4 + Math.floor(monthIndex / 3), 8_000 + monthIndex * 1_100],
      ["linkedin", "linkedin", 90 + monthIndex * 3, 2 + Math.floor(monthIndex / 4), 5_000 + monthIndex * 730],
    ];
    channelSpecs.forEach(([domain, source, spend, leads, pipeline]) => {
      const prefix = domain.toUpperCase();
      metrics.push(
        metric(`${prefix}-SPEND-${month}`, domain, "spend", month, spend, "EUR", source, seed, {}, asOf.slice(0, 10)),
        metric(`${prefix}-LEADS-${month}`, domain, "qualified_leads", month, leads, "count", source, seed, {}, asOf.slice(0, 10)),
        metric(`${prefix}-PIPE-${month}`, domain, "pipeline", month, pipeline, "EUR", source, seed, {}, asOf.slice(0, 10)),
        metric(`${prefix}-CONV-${month}`, domain, "conversions", month, Math.max(0, Math.round(leads * 0.32)), "count", source, seed, {}, asOf.slice(0, 10)),
      );

      // Les canaux ne partagent pas tous le même entonnoir. Ces observations
      // spécifiques évitent d'inventer des valeurs dans l'API de pilotage et
      // conservent une preuve source distincte pour chaque métrique affichée.
      if (domain === "google-ads") {
        metrics.push(
          metric(
            `GOOGLE-ADS-CLICKS-${month}`,
            domain,
            "clicks",
            month,
            241 + monthIndex * 17,
            "count",
            source,
            seed,
            { network: "search" },
            asOf.slice(0, 10),
          ),
        );
      }
      if (domain === "instagram") {
        metrics.push(
          metric(`INSTAGRAM-VIEWS-${month}`, domain, "views", month, 8_500 + monthIndex * 900, "count", source, seed, { format: "organic-content" }, asOf.slice(0, 10)),
          metric(`INSTAGRAM-SAVES-${month}`, domain, "saves", month, 238 + monthIndex * 34, "count", source, seed, { format: "organic-content" }, asOf.slice(0, 10)),
          metric(`INSTAGRAM-OPPORTUNITIES-${month}`, domain, "opportunities", month, monthIndex < 5 ? 0 : 1, "count", source, seed, { attribution: "crm-confirmed" }, asOf.slice(0, 10)),
        );
      }
    });

    const progress = monthIndex / 11;
    const openPipeline = Math.round(142_000 + progress * 42_000);
    const weightedPipeline = Math.round(73_000 + progress * 23_000);
    const conversionRate = Number((24 + progress * 7).toFixed(1));
    const workshopLoad = Number((72 + progress * 14).toFixed(1));
    const capacityDays = Math.max(4, Math.round(9 - progress * 5));
    const projectsAtRisk = monthIndex < 5 ? 1 : 2;
    const sensitiveDeadlines = 4 + Math.round(progress * 3);
    const webSessions = Math.round(760 + progress * 520);
    const webConversion = Number((1.9 + progress * .9).toFixed(2));
    const webForms = Math.round(14 + progress * 12);
    const nps = Math.round(46 + progress * 8);
    const activeClients = Math.round(18 + progress * 5);
    const dormantClients = Math.max(3, Math.round(7 - progress * 4));
    const headcount = monthIndex < 4 ? 16 : monthIndex < 9 ? 17 : 18;
    const utilisation = Number((74 + progress * 9).toFixed(1));
    const absenceDays = Math.max(2, Math.round(6 - progress * 2));
    const purchaseVariance = Number((1.2 + progress * 2.1).toFixed(1));
    const stockAlerts = Math.max(2, Math.round(6 - progress * 3));

    metrics.push(
      metric(`CRM-PIPE-${month}`, "crm", "open_pipeline", month, openPipeline, "EUR", "twenty", seed, {}, asOf.slice(0, 10)),
      metric(`CRM-WEIGHTED-${month}`, "crm", "weighted_pipeline", month, weightedPipeline, "EUR", "twenty", seed, {}, asOf.slice(0, 10)),
      metric(`CRM-CONVERSION-${month}`, "crm", "conversion_rate_90d", month, conversionRate, "percent", "twenty", seed, {}, asOf.slice(0, 10)),
      metric(`CRM-OPPORTUNITIES-${month}`, "crm", "open_opportunities", month, monthIndex === 11 ? 4 : 3 + (monthIndex % 3), "count", "twenty", seed, {}, asOf.slice(0, 10)),
      metric(`OPS-LOAD-${month}`, "operations", "workshop_load_percent", month, workshopLoad, "percent", "ops", seed, {}, asOf.slice(0, 10)),
      metric(`OPS-CAPACITY-${month}`, "operations", "available_capacity_days", month, capacityDays, "days", "ops", seed, {}, asOf.slice(0, 10)),
      metric(`OPS-RISKS-${month}`, "operations", "projects_at_risk", month, projectsAtRisk, "count", "ops", seed, {}, asOf.slice(0, 10)),
      metric(`OPS-DEADLINES-${month}`, "operations", "sensitive_deadlines", month, sensitiveDeadlines, "count", "ops", seed, {}, asOf.slice(0, 10)),
      metric(`WEB-SESSIONS-${month}`, "web", "sessions", month, webSessions, "count", "google-analytics", seed, {}, asOf.slice(0, 10)),
      metric(`WEB-CONVERSION-${month}`, "web", "lead_conversion_rate", month, webConversion, "percent", "google-analytics", seed, {}, asOf.slice(0, 10)),
      metric(`WEB-FORMS-${month}`, "web", "qualified_forms", month, webForms, "count", "google-analytics", seed, {}, asOf.slice(0, 10)),
      metric(`CX-NPS-${month}`, "customer", "nps", month, nps, "count", "ops", seed, {}, asOf.slice(0, 10)),
      metric(`CX-ACTIVE-${month}`, "customer", "active_clients", month, activeClients, "count", "ops", seed, {}, asOf.slice(0, 10)),
      metric(`CX-DORMANT-${month}`, "customer", "dormant_clients", month, dormantClients, "count", "ops", seed, {}, asOf.slice(0, 10)),
      metric(`HR-HEADCOUNT-${month}`, "hr", "headcount", month, headcount, "count", "personio", seed, {}, asOf.slice(0, 10)),
      metric(`HR-UTILISATION-${month}`, "hr", "productive_utilisation", month, utilisation, "percent", "personio", seed, {}, asOf.slice(0, 10)),
      metric(`HR-ABSENCE-${month}`, "hr", "absence_days", month, absenceDays, "days", "personio", seed, {}, asOf.slice(0, 10)),
      metric(`PROC-VARIANCE-${month}`, "procurement", "purchase_budget_variance", month, purchaseVariance, "percent", "inventory", seed, {}, asOf.slice(0, 10)),
      metric(`PROC-STOCK-${month}`, "procurement", "stock_alerts", month, stockAlerts, "count", "inventory", seed, {}, asOf.slice(0, 10)),
    );
  });
  // Les deux snapshots journaliers rendent un comparatif SEO daté et vérifiable possible.
  [
    ["2026-07-15", 4_210, 173, 4.11, 12.1, 42],
    ["2026-07-16", 4_790, 192, 4.13, 11.7, 50],
  ].forEach(([date, impressions, clicks, ctr, position, keywordClicks]) => {
    const typedDate = String(date);
    const dayId = typedDate.replaceAll("-", "");
    for (const [name, value, unit] of [
      ["impressions", impressions, "count"], ["clicks", clicks, "count"], ["ctr", ctr, "percent"],
      ["average_position", position, "position"], ["keyword_clicks_menuiserie_paris", keywordClicks, "count"],
    ] as const) {
      metrics.push({
        ...baseRecord(`SEO-DAY-${dayId}-${name.toUpperCase()}`, "google-search-console", `gsc_${dayId}_${name}`, isoAt(typedDate, 23, 45), seed),
        kind: "metric", domain: "seo", metric: name, periodStart: typedDate, periodEnd: typedDate,
        value: Number(value), unit, dimensions: name.includes("keyword") ? { query: "menuiserie sur mesure paris" } : {},
      });
    }
  });

  const referenceDocuments: Array<Pick<DocumentRecord, "id" | "title" | "documentType" | "summary" | "clientId" | "projectId">> = [
    { id: "ALERT-201", title: "Alerte marge Rivoli", documentType: "report", clientId: clients[1].id, projectId: "PROJET-241", summary: "La marge projetée passe de 31 % à 28,9 %. Rivoli explique 82 % de l’écart de 2 520 €." },
    { id: "TEMPS-086", title: "Temps non facturé · Rivoli", documentType: "report", clientId: clients[1].id, projectId: "PROJET-241", summary: "14 heures hors périmètre n’ont pas été facturées, soit 630 € de coût direct." },
    { id: "ACHAT-109", title: "Écart achat placage chêne", documentType: "attachment", clientId: clients[1].id, projectId: "PROJET-241", summary: "Le placage chêne dépasse le budget achat de 1 438 €." },
    { id: "SEO-SNAPSHOT-20260715", title: "Snapshot SEO · 15 juillet 2026", documentType: "report", clientId: null, projectId: null, summary: "4 210 impressions, 173 clics, CTR 4,11 %, position moyenne 12,1 et 42 clics sur “menuiserie sur mesure paris”." },
    { id: "SEO-SNAPSHOT-20260716", title: "Snapshot SEO · 16 juillet 2026", documentType: "report", clientId: null, projectId: null, summary: "4 790 impressions, 192 clics, CTR 4,13 %, position moyenne 11,7 et 50 clics sur “menuiserie sur mesure paris”." },
    { id: "SYNTH-2026-W29", title: "Synthèse de direction · semaine 29", documentType: "report", clientId: null, projectId: null, summary: "Priorités : protéger la marge Rivoli, encaisser 20,2 K€ déjà autorisés et concentrer l’acquisition sur Search et le SEO." },
    { id: "FIN-SNAPSHOT-20260715", title: "Snapshot finance · 15 juillet 2026", documentType: "report", clientId: null, projectId: null, summary: "CA mensuel 42,8 K€, marge moyenne 29 %, trésorerie 67 jours et créances ouvertes 24,3 K€." },
    { id: "CRM-SNAPSHOT-20260715", title: "Snapshot CRM · 15 juillet 2026", documentType: "report", clientId: null, projectId: null, summary: "Pipeline ouvert 184 K€ sur Studio Cime, Maison Lenoir, Hôtel Orsay et Extension Nova Hôtels." },
    { id: "GADS-2026-07", title: "Rapport Google Ads · juillet 2026", documentType: "report", clientId: null, projectId: null, summary: "Dépense 685 €, 12 leads qualifiés, 58 K€ de pipeline attribué et quatre conversions suivies." },
  ];
  referenceDocuments.forEach((document, index) => {
    documents.push({
      ...baseRecord(document.id, "drive", `reference_${document.id}`, isoAt(daysAgo(asOf, index % 3), 7, 45), seed, document.id.startsWith("FIN") ? "restricted" : "internal"),
      kind: "document",
      clientId: document.clientId,
      projectId: document.projectId,
      title: document.title,
      documentType: document.documentType,
      mimeType: "text/markdown",
      storageKey: `${TENANT_ID}/references/${document.id}.md`,
      sizeBytes: 6_800 + index * 431,
      sha256: stableHash(`${seed}:reference:${document.id}`),
      summary: document.summary,
    });
  });

  const executiveKnowledge: Array<{
    id: string;
    source: "notion" | "slack";
    title: string;
    summary: string;
    confidentiality?: Confidentiality;
  }> = [
    {
      id: "NTN-STRAT-SEO-Q3",
      source: "notion",
      title: "Stratégie SEO · troisième trimestre 2026",
      summary: "Objectif : faire entrer cinq requêtes métier locales dans le top 10 et porter les leads SEO qualifiés de 14 à 20 par mois. Entre le 15 et le 16 juillet, les impressions passent de 4 210 à 4 790, les clics de 173 à 192, le CTR de 4,11 % à 4,13 % et la position moyenne de 12,1 à 11,7. Priorités : renforcer les pages agencement hôtel Paris, publier deux études de cas et corriger les pages à fort volume situées entre les positions 8 et 15.",
    },
    {
      id: "NTN-STRAT-GADS-Q3",
      source: "notion",
      title: "Plan Google Ads · Search à intention forte",
      summary: "Google Ads concentre le meilleur signal payant : 685 € dépensés en juillet, 12 leads qualifiés, quatre conversions et 58 000 € de pipeline attribué. Le plan maintient les campagnes agencement hôtel et menuiserie sur mesure, exclut les requêtes emploi et bricolage, et impose un contrôle hebdomadaire du coût par lead, des termes de recherche et du suivi des appels.",
    },
    {
      id: "NTN-STRAT-META-Q3",
      source: "notion",
      title: "Arbitrage Meta Ads · juillet 2026",
      summary: "Meta Ads dépense 312 € sans lead qualifié attribué sur la période de référence. Décision proposée : ne pas augmenter le budget froid, conserver uniquement le retargeting des visiteurs et des vues vidéo, renouveler les créatifs chantier puis réévaluer après deux semaines avec un seuil d’arrêt explicite.",
    },
    {
      id: "NTN-STRAT-INSTAGRAM-Q3",
      source: "notion",
      title: "Stratégie Instagram · preuve par les réalisations",
      summary: "Les contenus chantier totalisent 18 400 vues et 612 enregistrements sur la séquence la plus performante. Studio Cime est relié à une opportunité de 20 000 €. Le plan recommande deux formats avant/après par semaine, un carrousel technique et une relance humaine des interactions provenant d’architectes ou d’hôteliers.",
    },
    {
      id: "NTN-STRAT-LINKEDIN-Q3",
      source: "notion",
      title: "Plan LinkedIn dirigeante · juillet à septembre",
      summary: "La ligne éditoriale repose sur les arbitrages réels de l’atelier : marge, choix matière, délais et conception hôtelière. Deux publications hebdomadaires sont prévues, accompagnées de commentaires ciblés sur les comptes d’architectes et de groupes hôteliers. Chaque interaction utile doit être reliée au CRM avant toute prise de contact.",
    },
    {
      id: "NTN-CASH-PLAN-202607",
      source: "notion",
      title: "Plan de sécurisation du cash · juillet 2026",
      summary: "Les créances ouvertes atteignent 24 300 €, dont 20 200 € déjà en retard et autorisés à la relance. Atelier Sud représente 12 400 € avec un virement annoncé ; Nova Hôtels représente 7 800 € ; Maison Cobalt doit rester hors relance jusqu’au retour du directeur financier lundi. L’objectif est de convertir les promesses d’encaissement en reçus bancaires sans dégrader la relation client.",
      confidentiality: "restricted",
    },
    {
      id: "NTN-MARGE-RIVOLI-202607",
      source: "notion",
      title: "Plan de récupération de marge · Rivoli",
      summary: "La marge Rivoli passe de 31 % à 28,9 %, soit 2,1 points d’écart. Quatorze heures non facturées représentent 630 €, le placage chêne dépasse le budget de 1 438 € et quatre jours supplémentaires complètent l’écart. L’avenant de 6 800 € protège environ 1,9 point de marge ; il doit contenir le détail des heures et de la matière.",
      confidentiality: "restricted",
    },
    {
      id: "NTN-CAPACITE-ATELIER-W29",
      source: "notion",
      title: "Capacité atelier · semaine 29",
      summary: "La charge atelier atteint 86 %, avec quatre jours de capacité encore disponibles et deux projets à risque. Un renfort de trois jours a été décidé pour absorber Rivoli sans déplacer la pose d’Orsay. Le contrôle quotidien porte sur les heures hors périmètre, les approvisionnements critiques et les sept échéances de la semaine.",
    },
    {
      id: "NTN-REACTIVATION-Q3",
      source: "notion",
      title: "Programme de réactivation clients",
      summary: "Groupe Lumen et Studio Marais ont répondu positivement après plus de 75 jours sans commande. Le programme classe les anciens clients selon récence, valeur historique, signaux reçus et capacité disponible. Toute relance doit reprendre le dernier projet et proposer une prochaine étape concrète plutôt qu’un message générique.",
    },
    {
      id: "NTN-RH-COMPETENCES-2026",
      source: "notion",
      title: "Compétences critiques et continuité d’équipe",
      summary: "L’effectif de référence est de 18 personnes et l’utilisation productive progresse. Les savoirs les plus sensibles concernent les réglages CNC, les finitions et le chiffrage des variantes matière. Les procédures doivent être reliées aux personnes qui les maîtrisent, aux projets où elles ont été appliquées et à un remplaçant identifié.",
    },
    {
      id: "NTN-ACHATS-Q3",
      source: "notion",
      title: "Pilotage achats et approvisionnements",
      summary: "Le contrôle achats suit l’écart au budget, les ruptures et les matières commandées hors périmètre. Le placage chêne Rivoli constitue l’écart prioritaire avec 1 438 € au-dessus du budget. Toute commande complémentaire doit être reliée à un projet, une validation et une possibilité de refacturation.",
    },
    {
      id: "NTN-CODIR-20260716",
      source: "notion",
      title: "Brief de direction · 16 juillet 2026",
      summary: "Le pipeline ouvert atteint 184 000 €, le chiffre d’affaires mensuel 42 800 €, la marge moyenne 29 % et la visibilité de trésorerie 67 jours. Les trois décisions du jour sont de sécuriser les 20 200 € de relances validées, finaliser l’avenant Rivoli de 6 800 € et concentrer l’acquisition sur Search, SEO et les signaux Instagram qualifiés.",
      confidentiality: "restricted",
    },
    {
      id: "SLK-DIRECTION-20260716",
      source: "slack",
      title: "Synthèse Slack · #direction · 16 juillet",
      summary: "Marie demande un brief court pour le CODIR. Camille confirme 184 000 € de pipeline ouvert. Hugo signale que Rivoli concentre l’écart de marge. La priorité partagée est d’obtenir les reçus d’encaissement, de verrouiller l’avenant et de ne pas augmenter Meta Ads sans preuve de leads qualifiés.",
      confidentiality: "restricted",
    },
    {
      id: "SLK-FINANCE-20260716",
      source: "slack",
      title: "Synthèse Slack · #finance · 16 juillet",
      summary: "Atelier Sud annonce un virement de 12 400 € pour le lendemain et demande une confirmation d’IBAN. Nova Hôtels reste à 7 800 € en retard. Maison Cobalt demande explicitement d’attendre lundi. L’équipe convient de distinguer les relances préparées, validées, envoyées et réellement encaissées.",
      confidentiality: "restricted",
    },
    {
      id: "SLK-MARKETING-20260716",
      source: "slack",
      title: "Synthèse Slack · #marketing · 16 juillet",
      summary: "Le SEO progresse de 580 impressions et 19 clics en un jour, avec une position moyenne gagnant 0,4 point. Google Search reste le premier levier de pipeline payant. L’équipe prépare une étude de cas Rivoli, un contenu chantier Instagram et une vérification des conversions avant le prochain arbitrage budgétaire.",
    },
    {
      id: "SLK-ATELIER-20260716",
      source: "slack",
      title: "Synthèse Slack · #atelier · 16 juillet",
      summary: "L’atelier confirme 14 heures Rivoli hors périmètre, un dépassement sur le placage chêne et quatre jours supplémentaires. Le renfort de trois jours est réservé. Thomas doit tracer chaque heure, Hugo consolider le détail pour l’avenant et Inès contrôler la réception matière.",
    },
  ];
  executiveKnowledge.forEach((document, index) => {
    const knowledgeDaysAgo = index % 5;
    documents.push({
      ...baseRecord(
        document.id,
        document.source,
        `executive_${document.id.toLocaleLowerCase("fr")}`,
        isoAt(daysAgo(asOf, knowledgeDaysAgo), knowledgeDaysAgo === 0 ? 7 : 8 + (index % 9), 12),
        seed,
        document.confidentiality ?? "internal",
      ),
      kind: "document",
      clientId: null,
      projectId: document.id.includes("RIVOLI") ? "PROJET-241" : null,
      title: document.title,
      documentType: "report",
      mimeType: "text/markdown",
      storageKey: `${TENANT_ID}/direction/${document.id}.md`,
      sizeBytes: 5_900 + index * 307,
      sha256: stableHash(`${seed}:executive-knowledge:${document.id}`),
      summary: document.summary,
    });
  });

  const relations: RelationRecord[] = [];
  contacts.forEach((contact) => relations.push(relation(contact.id, contact.clientId, "works-at", [contact.id], contact.createdAt, seed)));
  opportunities.forEach((opportunity) => {
    relations.push(relation(opportunity.id, opportunity.clientId, "concerns", [opportunity.id], opportunity.createdAt, seed));
    relations.push(relation(opportunity.primaryContactId, opportunity.id, "participates-in", [opportunity.id], opportunity.createdAt, seed));
  });
  projects.forEach((project) => {
    relations.push(relation(project.id, project.clientId, "concerns", [project.id], project.startDate, seed));
    relations.push(relation(project.id, project.opportunityId, "generated", [project.opportunityId], project.startDate, seed));
  });
  invoices.forEach((invoice) => {
    relations.push(relation(invoice.id, invoice.clientId, "concerns", [invoice.id], invoice.issuedOn, seed));
    if (invoice.projectId) relations.push(relation(invoice.id, invoice.projectId, "documents", [invoice.id], invoice.issuedOn, seed));
  });
  payments.forEach((payment) => relations.push(relation(payment.id, payment.invoiceId, "paid-by", [payment.id], payment.paidOn, seed)));
  emailThreads.forEach((thread) => {
    relations.push(relation(thread.id, thread.clientId, "concerns", thread.messageIds.slice(-2), thread.createdAt, seed));
    thread.contactIds.forEach((contactId) => relations.push(relation(contactId, thread.id, "participates-in", thread.messageIds.slice(-1), thread.createdAt, seed)));
    if (thread.projectId) relations.push(relation(thread.id, thread.projectId, "mentions", thread.messageIds.slice(-2), thread.createdAt, seed));
  });
  meetings.forEach((meeting) => {
    relations.push(relation(meeting.id, meeting.clientId, "concerns", [meeting.transcriptDocumentId], meeting.startsAt, seed));
    meeting.participantIds.filter((id) => id.startsWith("PER-")).forEach((contactId) => relations.push(relation(contactId, meeting.id, "participates-in", [meeting.transcriptDocumentId], meeting.startsAt, seed)));
  });
  decisions.forEach((decision) => {
    if (decision.clientId) relations.push(relation(decision.id, decision.clientId, "concerns", decision.sourceMeetingId ? [decision.sourceMeetingId] : [], decision.decidedOn, seed));
    if (decision.sourceMeetingId) relations.push(relation(decision.id, decision.sourceMeetingId, "decided-in", [decision.sourceMeetingId], decision.decidedOn, seed));
  });
  relations.push(relation("VAL-061", clients[3].id, "concerns", ["FACT-879", "FACT-886"], "2026-07-15", seed));
  tasks.forEach((task) => {
    if (task.sourceDecisionId) relations.push(relation(task.sourceDecisionId, task.id, "creates-task", [task.sourceDecisionId], task.createdAt, seed));
    if (task.projectId) relations.push(relation(task.id, task.projectId, "concerns", [task.id], task.createdAt, seed));
  });
  documents.forEach((document) => {
    if (document.clientId) relations.push(relation(document.id, document.clientId, "documents", [document.id], document.createdAt, seed));
  });
  commitments.forEach((commitment) => {
    relations.push(relation(commitment.contactId, commitment.id, "committed-to", [commitment.evidenceId], commitment.committedOn, seed));
    relations.push(relation(commitment.id, commitment.clientId, "concerns", [commitment.evidenceId], commitment.committedOn, seed));
    if (commitment.projectId) relations.push(relation(commitment.id, commitment.projectId, "depends-on", [commitment.evidenceId], commitment.committedOn, seed));
  });

  const eventCollections: Array<Array<MemoryRecord & { kind: string }>> = [
    clients, contacts, opportunities, projects, invoices, payments, emailThreads, emailMessages,
    meetings, metrics, decisions, tasks, documents, commitments,
  ];
  const sourceEvents: SourceEventRecord[] = eventCollections.flatMap((collection) => collection.map((record) => {
    const eventType: SourceEventRecord["eventType"] = record.kind === "email-message"
      ? (record as EmailMessageRecord).direction === "inbound" ? "received" : "sent"
      : record.kind === "payment" ? "paid"
        : record.kind === "decision" ? "decided"
          : record.kind === "metric" ? "measured"
            : "created";
    const id = `EVT-${stableHash(`${record.kind}:${record.id}`).slice(0, 16).toUpperCase()}`;
    return {
      ...baseRecord(id, record.trace.source, `${record.trace.sourceId}:event`, record.createdAt, seed, record.confidentiality),
      kind: "source-event",
      eventType,
      objectType: record.kind,
      objectId: record.id,
      occurredAt: record.createdAt,
      payload: { source_id: record.trace.sourceId, version: record.version, deleted: false },
    };
  }));

  return {
    schemaVersion: "1.0",
    seed,
    generatedAt: asOf,
    tenant: { id: TENANT_ID, name: "Atelier Beaumarchais", timezone: "Europe/Paris", currency: "EUR" },
    team,
    clients,
    contacts,
    opportunities,
    projects,
    invoices,
    payments,
    emailThreads,
    emailMessages,
    meetings,
    metrics,
    decisions,
    tasks,
    documents,
    commitments,
    relations,
    sourceEvents,
  };
}

export function calculateUniverseAggregates(universe: CompanyMemoryUniverse): UniverseAggregates {
  const openStages = new Set<OpportunityRecord["stage"]>(["qualification", "discovery", "proposal", "negotiation"]);
  const latestMonth = universe.metrics.filter((item) => item.domain === "finance").reduce((latest, item) => item.periodStart > latest ? item.periodStart : latest, "").slice(0, 7);
  const metricValue = (metricName: string) => universe.metrics.find((item) => item.domain === "finance" && item.metric === metricName && item.periodStart.startsWith(latestMonth))?.value ?? 0;
  return {
    counts: {
      team: universe.team.length,
      clients: universe.clients.length,
      contacts: universe.contacts.length,
      opportunities: universe.opportunities.length,
      projects: universe.projects.length,
      invoices: universe.invoices.length,
      payments: universe.payments.length,
      emailThreads: universe.emailThreads.length,
      emailMessages: universe.emailMessages.length,
      meetings: universe.meetings.length,
      metrics: universe.metrics.length,
      decisions: universe.decisions.length,
      tasks: universe.tasks.length,
      documents: universe.documents.length,
      commitments: universe.commitments.length,
      relations: universe.relations.length,
      sourceEvents: universe.sourceEvents.length,
    },
    openPipelineCents: universe.opportunities.filter((item) => openStages.has(item.stage)).reduce((sum, item) => sum + item.amountCents, 0),
    outstandingReceivablesCents: universe.invoices.reduce((sum, item) => sum + item.amountIncludingTaxCents - item.paidCents, 0),
    overdueReceivablesCents: universe.invoices.filter((item) => item.status === "overdue").reduce((sum, item) => sum + item.amountIncludingTaxCents - item.paidCents, 0),
    currentMonthRevenueCents: Math.round(metricValue("revenue") * 100),
    currentGrossMarginPercent: metricValue("gross_margin"),
    graphNodeCount: universe.clients.length + universe.contacts.length + universe.opportunities.length + universe.projects.length + universe.invoices.length + universe.emailThreads.length + universe.meetings.length + universe.decisions.length + universe.tasks.length + universe.documents.length + universe.commitments.length,
    graphRelationCount: universe.relations.length,
  };
}

export const expectedUniverseAggregates: Pick<UniverseAggregates, "openPipelineCents" | "outstandingReceivablesCents" | "overdueReceivablesCents" | "currentMonthRevenueCents" | "currentGrossMarginPercent"> = {
  openPipelineCents: 18_400_000,
  outstandingReceivablesCents: 2_430_000,
  overdueReceivablesCents: 2_020_000,
  currentMonthRevenueCents: 4_280_000,
  currentGrossMarginPercent: 29,
};

export const centralMemoryImportOrder = [
  "clients", "contacts", "opportunities", "projects", "documents", "invoices", "payments",
  "emailThreads", "emailMessages", "meetings", "metrics", "decisions", "tasks", "commitments",
  "relations", "sourceEvents",
] as const satisfies ReadonlyArray<keyof CompanyMemoryUniverse>;

/**
 * Format de transit stable pour un futur import PostgreSQL/queue : une ligne
 * autonome par enregistrement, avec table, tenant, version de schéma et donnée.
 */
export function serializeUniverseAsNdjson(universe: CompanyMemoryUniverse) {
  return centralMemoryImportOrder.flatMap((table) => {
    const rows = universe[table];
    return rows.map((data) => JSON.stringify({
      schema_version: universe.schemaVersion,
      tenant_id: universe.tenant.id,
      table,
      data,
    }));
  }).join("\n");
}
