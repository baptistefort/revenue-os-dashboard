export type OpsMemoryRecord = {
  id: string;
  type: "validation" | "mission" | "invoice" | "email" | "rule" | "snapshot" | "project" | "marketing" | "decision" | "time" | "purchase" | "alert" | "meeting" | "opportunity" | "procedure" | "seo";
  title: string;
  summary: string;
  facts: string[];
  relations: string[];
  aliases: string[];
  updatedAt: string;
};

export type AgentHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export const opsMemoryRecords: OpsMemoryRecord[] = [
  {
    id: "VAL-061",
    type: "validation",
    title: "Envoyer deux relances clients",
    summary: "Autorisation attendue avant l’envoi de deux brouillons de relance pour Atelier Sud et Nova Hôtels.",
    facts: [
      "Montant total concerné : 20,2 K€.",
      "Atelier Sud : 12,4 K€ de retard depuis 28 jours ; ton direct et chaleureux recommandé.",
      "Nova Hôtels : 7,8 K€ de retard depuis 12 jours ; ton ferme et duplicata de facture à joindre.",
      "Maison Cobalt est exclue : son dernier email demande d’attendre lundi.",
      "Risque faible : aucun prix, contrat ou engagement nouveau n’est modifié.",
      "La validation de Marie reste obligatoire avant tout envoi externe.",
    ],
    relations: ["MIS-031", "FACT-879", "EMAIL-901", "FACT-886", "EMAIL-902", "FACT-890", "EMAIL-905", "RULE-001", "RULE-002"],
    aliases: ["validation relances", "deux relances", "relances à valider"],
    updatedAt: "2026-07-15T09:58:00+02:00",
  },
  {
    id: "VAL-063",
    type: "validation",
    title: "Valider l’avenant Rivoli",
    summary: "Avenant de 6,8 K€ destiné à couvrir les modifications de finition confirmées par le client.",
    facts: [
      "L’avenant protège environ 1,9 point de marge.",
      "La marge Rivoli est projetée à 28,9 % contre 31 % initialement.",
      "La décision est attendue avant midi.",
      "Risque moyen : l’avenant engage le client et doit être relu avant envoi.",
    ],
    relations: ["PROJET-241", "DEC-063", "EMAIL-903", "CR-1207", "ALERT-201"],
    aliases: ["avenant rivoli", "validation rivoli"],
    updatedAt: "2026-07-15T09:42:00+02:00",
  },
  {
    id: "MIS-031",
    type: "mission",
    title: "Relances clients en retard",
    summary: "Mission Finance complétée à 72 % ; deux brouillons attendent la validation VAL-061.",
    facts: ["Deux brouillons sont prêts.", "Aucun message n’est parti.", "Responsable : Agent Finance avec Inès Martin."],
    relations: ["VAL-061", "FACT-879", "FACT-886", "RULE-001"],
    aliases: ["mission relances", "brouillons relances"],
    updatedAt: "2026-07-15T09:55:00+02:00",
  },
  {
    id: "FACT-879",
    type: "invoice",
    title: "Facture Atelier Sud",
    summary: "Facture de 12,4 K€ en retard depuis 28 jours.",
    facts: ["Client historique.", "Le client indique que le règlement sera traité cette semaine.", "Ton direct mais chaleureux recommandé."],
    relations: ["EMAIL-901", "VAL-061", "RULE-002"],
    aliases: ["atelier sud", "facture atelier sud"],
    updatedAt: "2026-07-15T08:50:00+02:00",
  },
  {
    id: "EMAIL-901",
    type: "email",
    title: "Sophie Leclerc — facture de juin",
    summary: "Atelier Sud indique que le règlement sera traité cette semaine.",
    facts: ["Dernier échange reçu aujourd’hui à 10 h 24.", "Aucun litige signalé."],
    relations: ["FACT-879", "VAL-061"],
    aliases: ["email atelier sud", "sophie leclerc"],
    updatedAt: "2026-07-15T10:24:00+02:00",
  },
  {
    id: "FACT-886",
    type: "invoice",
    title: "Facture Nova Hôtels",
    summary: "Facture de 7,8 K€ en retard depuis 12 jours ; le cycle de validation client est dépassé.",
    facts: ["Une relance ferme est justifiée.", "Le duplicata demandé doit être joint au message."],
    relations: ["EMAIL-902", "VAL-061", "OPP-404"],
    aliases: ["nova", "nova hôtels", "facture nova"],
    updatedAt: "2026-07-15T09:52:00+02:00",
  },
  {
    id: "EMAIL-902",
    type: "email",
    title: "Pierre Lenoir — duplicata Nova",
    summary: "Nova Hôtels demande un duplicata et n’a obtenu aucun délai supplémentaire.",
    facts: ["Dernier échange reçu à 9 h 52.", "Aucune contestation du montant n’est enregistrée."],
    relations: ["FACT-886", "VAL-061"],
    aliases: ["email nova", "pierre lenoir", "duplicata nova"],
    updatedAt: "2026-07-15T09:52:00+02:00",
  },
  {
    id: "FACT-890",
    type: "invoice",
    title: "Facture Maison Cobalt",
    summary: "Facture de 4,1 K€ en retard depuis 8 jours, mais relance suspendue jusqu’à lundi.",
    facts: ["Le client a annoncé son virement pour lundi.", "Aucune action recommandée aujourd’hui."],
    relations: ["EMAIL-905", "VAL-061"],
    aliases: ["maison cobalt", "facture cobalt"],
    updatedAt: "2026-07-14T16:20:00+02:00",
  },
  {
    id: "EMAIL-905",
    type: "email",
    title: "Maison Cobalt — échéance",
    summary: "Le virement partira lundi prochain ; ne pas relancer avant cette date.",
    facts: ["Engagement écrit du client.", "La règle de suivi place ce dossier en attente."],
    relations: ["FACT-890", "VAL-061"],
    aliases: ["email cobalt", "virement lundi"],
    updatedAt: "2026-07-14T16:20:00+02:00",
  },
  {
    id: "RULE-001",
    type: "rule",
    title: "Aucune action externe sans validation",
    summary: "Toute action vers un client, un prospect ou un partenaire exige la validation de Marie.",
    facts: ["La préparation automatique est autorisée.", "L’envoi automatique est interdit sans autorisation explicite."],
    relations: ["VAL-061", "VAL-063"],
    aliases: ["validation humaine", "action externe"],
    updatedAt: "2026-07-01T09:00:00+02:00",
  },
  {
    id: "RULE-002",
    type: "rule",
    title: "Ton des relances",
    summary: "Le ton dépend de l’ancienneté, de la relation et du dernier échange client.",
    facts: ["Un historique positif adoucit le ton.", "Un cycle dépassé sans contestation justifie un ton plus ferme."],
    relations: ["FACT-879", "FACT-886", "VAL-061"],
    aliases: ["ton relance", "règle relance"],
    updatedAt: "2026-07-01T09:00:00+02:00",
  },
  {
    id: "CRM-SNAPSHOT-20260715",
    type: "snapshot",
    title: "Pipeline commercial",
    summary: "Pipeline ouvert de 184 K€ réparti sur quatre opportunités.",
    facts: ["Objectif trimestriel : 220 K€.", "Hôtel Orsay : 58 K€.", "Extension Nova : 72 K€.", "Maison Lenoir : 34 K€.", "Studio Cime : 20 K€."],
    relations: ["OPP-401", "OPP-404", "STRAT-2026-Q3"],
    aliases: ["pipeline", "crm", "opportunités"],
    updatedAt: "2026-07-15T08:03:00+02:00",
  },
  {
    id: "FIN-SNAPSHOT-20260715",
    type: "snapshot",
    title: "Situation financière",
    summary: "CA du mois 42,8 K€, marge moyenne 29 %, trésorerie 67 jours et créances 24,3 K€.",
    facts: ["Le CA progresse de 12 %.", "La marge recule de 2,1 points.", "La visibilité de trésorerie reste supérieure à 60 jours."],
    relations: ["ALERT-201", "FACT-879", "FACT-886", "FACT-890"],
    aliases: ["finance", "marge", "trésorerie", "créances", "chiffres"],
    updatedAt: "2026-07-15T08:03:00+02:00",
  },
  {
    id: "PROJET-241",
    type: "project",
    title: "Chantier Rivoli",
    summary: "Projet de 120 K€ avancé à 62 %, avec une marge projetée à 28,9 % contre 31 % initialement.",
    facts: ["14 heures non facturées coûtent 630 €.", "Le placage dépasse le budget de 1 438 €.", "Ces deux causes expliquent 82 % de l’écart.", "Un avenant de 6,8 K€ protégerait 1,9 point de marge."],
    relations: ["TEMPS-086", "ACHAT-109", "ALERT-201", "VAL-063"],
    aliases: ["rivoli", "chantier rivoli", "marge atelier"],
    updatedAt: "2026-07-15T07:46:00+02:00",
  },
  {
    id: "GADS-2026-07",
    type: "marketing",
    title: "Google Ads — Agencement hôtel Paris",
    summary: "684 € dépensés, 11 leads, 4 qualifiés et 58 K€ de pipeline attribué.",
    facts: ["Google Search produit la demande la plus qualifiée.", "Une réallocation de 200 € depuis Meta est proposée."],
    relations: ["META-2026-07", "OPP-401", "STRAT-2026-Q3"],
    aliases: ["google ads", "google search", "acquisition"],
    updatedAt: "2026-07-15T07:30:00+02:00",
  },
  {
    id: "META-2026-07",
    type: "marketing",
    title: "Meta Ads — Retargeting portfolio",
    summary: "312 € dépensés, 3 leads et aucun lead qualifié.",
    facts: ["La créa fatigue depuis 12 jours.", "Suspension de la créa proposée avant nouvelle hypothèse."],
    relations: ["GADS-2026-07", "ALERT-203"],
    aliases: ["meta ads", "facebook ads", "instagram ads"],
    updatedAt: "2026-07-15T07:30:00+02:00",
  },
  {
    id: "STRAT-2026-Q3",
    type: "decision",
    title: "Stratégie commerciale T3",
    summary: "Objectif pipeline 220 K€, marge cible 32 % et trésorerie supérieure à 60 jours.",
    facts: ["Trois priorités : protéger la marge Rivoli, récupérer les créances et renforcer Google Search."],
    relations: ["CRM-SNAPSHOT-20260715", "FIN-SNAPSHOT-20260715", "PROJET-241", "GADS-2026-07"],
    aliases: ["stratégie", "trimestre", "objectif t3"],
    updatedAt: "2026-07-14T17:30:00+02:00",
  },
  {
    id: "TEMPS-086",
    type: "time",
    title: "Heures Rivoli non facturées",
    summary: "Quatorze heures de travail ne sont pas rattachées à un poste facturable du chantier Rivoli.",
    facts: ["Impact estimé : 630 €.", "Cet écart contribue directement à la baisse de marge."],
    relations: ["PROJET-241", "ALERT-201"],
    aliases: ["heures rivoli", "heures non facturées"],
    updatedAt: "2026-07-15T07:44:00+02:00",
  },
  {
    id: "ACHAT-109",
    type: "purchase",
    title: "Dépassement placage chêne Rivoli",
    summary: "L’achat de placage chêne dépasse le budget du chantier Rivoli de 1 438 €.",
    facts: ["Le dépassement doit être couvert par l’avenant ou absorbé par la marge."],
    relations: ["PROJET-241", "VAL-063"],
    aliases: ["achat rivoli", "placage chêne"],
    updatedAt: "2026-07-15T07:42:00+02:00",
  },
  {
    id: "ALERT-201",
    type: "alert",
    title: "Écart de marge Rivoli",
    summary: "Rivoli explique 82 % de l’écart de marge atelier observé cette semaine.",
    facts: ["Causes confirmées : TEMPS-086 et ACHAT-109.", "Décision liée : VAL-063."],
    relations: ["PROJET-241", "TEMPS-086", "ACHAT-109", "VAL-063"],
    aliases: ["alerte marge", "écart rivoli"],
    updatedAt: "2026-07-15T07:46:00+02:00",
  },
  {
    id: "DEC-063",
    type: "decision",
    title: "Arbitrage avenant Rivoli",
    summary: "Décision de préparer un avenant de 6,8 K€ avant validation de Marie.",
    facts: ["Résultat attendu : protéger environ 1,9 point de marge."],
    relations: ["VAL-063", "PROJET-241", "CR-1207"],
    aliases: ["décision rivoli", "arbitrage avenant"],
    updatedAt: "2026-07-15T09:40:00+02:00",
  },
  {
    id: "EMAIL-903",
    type: "email",
    title: "Confirmation client Rivoli",
    summary: "Le client confirme le changement de finition sous réserve de recevoir le chiffrage.",
    facts: ["Aucun refus de principe n’est enregistré."],
    relations: ["VAL-063", "PROJET-241"],
    aliases: ["email rivoli", "confirmation finition"],
    updatedAt: "2026-07-15T09:28:00+02:00",
  },
  {
    id: "CR-1207",
    type: "meeting",
    title: "Compte rendu chantier Rivoli",
    summary: "Le changement de finition et son impact planning ont été actés en réunion chantier.",
    facts: ["Le chiffrage complémentaire reste à faire valider."],
    relations: ["PROJET-241", "VAL-063", "EMAIL-903"],
    aliases: ["réunion rivoli", "compte rendu rivoli"],
    updatedAt: "2026-07-12T16:15:00+02:00",
  },
  {
    id: "OPP-404",
    type: "opportunity",
    title: "Extension Nova Hôtels",
    summary: "Opportunité de 72 K€ en négociation avec une probabilité estimée à 78 %.",
    facts: ["La qualité de la relation de paiement doit être suivie sans bloquer la négociation."],
    relations: ["FACT-886", "EMAIL-902", "CRM-SNAPSHOT-20260715"],
    aliases: ["extension nova", "opportunité nova"],
    updatedAt: "2026-07-15T08:00:00+02:00",
  },
  {
    id: "PROC-007",
    type: "procedure",
    title: "Calibration CNC",
    summary: "La procédure de calibration CNC dépend encore principalement de Thomas.",
    facts: ["Un transfert de savoir de 45 minutes vers Hugo est recommandé cette semaine."],
    relations: ["STRAT-2026-Q3"],
    aliases: ["calibration cnc", "savoir thomas"],
    updatedAt: "2026-07-14T14:00:00+02:00",
  },
  {
    id: "SEO-001",
    type: "seo",
    title: "Étude de cas SEO Rivoli",
    summary: "Transformer le chantier Rivoli en page d’étude de cas pour soutenir SEO, Ads et prospection.",
    facts: ["Cible : la requête agencement hôtel Paris.", "Position actuelle de démonstration : 7."],
    relations: ["PROJET-241", "GADS-2026-07", "STRAT-2026-Q3"],
    aliases: ["seo rivoli", "agencement hôtel paris"],
    updatedAt: "2026-07-15T07:25:00+02:00",
  },
];

const memoryById = new Map(opsMemoryRecords.map((record) => [record.id, record]));
const searchStopWords = new Set([
  "alors", "avec", "avoir", "comment", "dans", "des", "elle", "elles", "entre", "est", "etre", "fais", "fait", "faire", "faut", "ici", "les", "leur", "mais", "mes", "moi", "montre", "nous", "par", "pas", "peut", "plus", "pour", "pourquoi", "quelle", "quelles", "quels", "quoi", "rire", "sans", "ses", "son", "sur", "tous", "tout", "une", "vous", "veux",
]);

export function normalizeMemoryQuery(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMemoryIds(value: string) {
  return [...new Set(value.toLocaleUpperCase("fr").match(/\b[A-Z]{2,12}(?:-[A-Z0-9]+)+\b/g) ?? [])]
    .filter((candidate) => /\d/.test(candidate));
}

export function getMemoryRecord(id: string) {
  return memoryById.get(id.toLocaleUpperCase("fr"));
}

export function getRelatedMemory(record: OpsMemoryRecord) {
  return record.relations.map((id) => memoryById.get(id)).filter((candidate): candidate is OpsMemoryRecord => Boolean(candidate));
}

export function findContextualMemoryId(history: AgentHistoryTurn[]) {
  for (const role of ["user", "assistant"] as const) {
    for (const turn of [...history].reverse()) {
      if (turn.role !== role) continue;
      const id = extractMemoryIds(turn.content).find((candidate) => memoryById.has(candidate));
      if (id) return id;
    }
  }
  return null;
}

export function searchCompanyMemory(query: string, history: AgentHistoryTurn[] = [], limit = 8) {
  const normalized = normalizeMemoryQuery(query);
  const explicitIds = extractMemoryIds(query);
  const exact = explicitIds.map((id) => memoryById.get(id)).filter((record): record is OpsMemoryRecord => Boolean(record));
  if (explicitIds.length && !exact.length) return [];
  if (exact.length) {
    const related = exact.flatMap(getRelatedMemory);
    return [...new Map([...exact, ...related].map((record) => [record.id, record])).values()].slice(0, limit);
  }

  const contextId = /\b(la|le|elle|lui|cette|ce|les|brouillon|detail|détail|compare)\b/i.test(query)
    ? findContextualMemoryId(history)
    : null;
  if (contextId) {
    const contextual = memoryById.get(contextId);
    if (contextual) return [contextual, ...getRelatedMemory(contextual)].slice(0, limit);
  }

  return opsMemoryRecords
    .map((record) => {
      const haystack = normalizeMemoryQuery([record.id, record.title, record.summary, ...record.facts, ...record.aliases].join(" "));
      const haystackWords = new Set(haystack.split(/[^a-z0-9]+/).filter(Boolean));
      const words = normalized
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !searchStopWords.has(word));
      const aliasMatch = record.aliases.some((alias) => normalized.includes(normalizeMemoryQuery(alias)));
      const score = words.reduce((total, word) => total + (haystackWords.has(word) ? 1 : 0), 0) + (aliasMatch ? 3 : 0);
      return { record, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt))
    .slice(0, limit)
    .map(({ record }) => record);
}

export function serializeMemoryRecords(records: OpsMemoryRecord[]) {
  return records
    .map((record) => `[${record.id}] ${record.title}\nRésumé : ${record.summary}\nFaits : ${record.facts.join(" ")}\nRelations : ${record.relations.join(", ") || "aucune"}\nMis à jour : ${record.updatedAt}`)
    .join("\n\n");
}
