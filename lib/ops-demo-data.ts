export type PageId =
  | "today"
  | "agent"
  | "cycle"
  | "emails"
  | "documents"
  | "clients"
  | "planning"
  | "crm"
  | "numbers"
  | "brain";

export type IconName =
  | "grid"
  | "spark"
  | "cycle"
  | "mail"
  | "document"
  | "users"
  | "calendar"
  | "database"
  | "chart"
  | "brain"
  | "search"
  | "plus"
  | "minus"
  | "fit"
  | "chevron"
  | "arrow"
  | "microphone"
  | "attach"
  | "command"
  | "check"
  | "clock"
  | "filter"
  | "dots"
  | "close"
  | "send"
  | "briefcase"
  | "coins"
  | "trend"
  | "target"
  | "link"
  | "shield"
  | "invoice"
  | "project"
  | "copy"
  | "thumb"
  | "edit"
  | "download"
  | "volume"
  | "pause"
  | "waveform"
  | "folder";

export const navGroups: Array<{
  label: string;
  items: Array<{ id: PageId; label: string; icon: IconName; badge?: number }>;
}> = [
  {
    label: "Pilotage",
    items: [
      { id: "today", label: "Tableau de bord", icon: "grid" },
      { id: "agent", label: "Mon agent", icon: "spark" },
    ],
  },
  {
    label: "Activité",
    items: [
      { id: "cycle", label: "Cycle d’affaire", icon: "cycle", badge: 4 },
      { id: "emails", label: "Emails", icon: "mail", badge: 7 },
      { id: "documents", label: "Documents", icon: "document" },
      { id: "clients", label: "Clients", icon: "users" },
    ],
  },
  {
    label: "Données & gestion",
    items: [
      { id: "planning", label: "Planning", icon: "calendar" },
      { id: "crm", label: "CRM", icon: "database" },
      { id: "numbers", label: "Chiffres", icon: "chart" },
    ],
  },
  {
    label: "Mémoire",
    items: [{ id: "brain", label: "Cerveau", icon: "brain" }],
  },
];

export const pageMeta: Record<PageId, { title: string; eyebrow: string; description: string }> = {
  today: {
    title: "Bonjour Marie.",
    eyebrow: "Vendredi 17 juillet · 08:03",
    description: "Voici ce qui mérite votre attention aujourd’hui.",
  },
  agent: {
    title: "Bonjour Marie. On commence ?",
    eyebrow: "Agent OPS",
    description: "Interrogez toute votre entreprise ou confiez-lui un objectif.",
  },
  cycle: {
    title: "Cycle d’affaire",
    eyebrow: "Du premier besoin au paiement",
    description: "Chaque dossier, son responsable, ses documents et sa prochaine action.",
  },
  emails: {
    title: "Emails",
    eyebrow: "Boîte de réception unifiée",
    description: "Les conversations importantes, classées et reliées au bon dossier.",
  },
  documents: {
    title: "Documents",
    eyebrow: "Mémoire documentaire",
    description: "Contrats, devis, factures, procédures et comptes rendus compris par OPS.",
  },
  clients: {
    title: "Clients",
    eyebrow: "Portefeuille & relations",
    description: "Une vue continue de chaque client, de ses chiffres et de son histoire.",
  },
  planning: {
    title: "Planning",
    eyebrow: "Projets, équipe & capacité",
    description: "Les engagements à venir et les écarts qui peuvent encore être corrigés.",
  },
  crm: {
    title: "CRM",
    eyebrow: "Pipeline commercial",
    description: "184 K€ d’opportunités ouvertes, avec les risques et signaux expliqués.",
  },
  numbers: {
    title: "Chiffres",
    eyebrow: "Activité, marge & acquisition",
    description: "Des chiffres reliés à leur cause, pas un tableau de bord de plus.",
  },
  brain: {
    title: "Cerveau",
    eyebrow: "Mémoire vivante de l’entreprise",
    description: "Explorez les liens entre clients, personnes, projets, décisions et sources.",
  },
};

export const company = {
  name: "Atelier Beaumarchais",
  trade: "Menuiserie · Paris 11",
  initials: "AB",
  synced: "Synchronisé il y a 2 min",
};

export const kpis = [
  { label: "Pipeline", value: "184 K€", delta: "+12 %", tone: "positive", page: "crm" as PageId },
  { label: "CA du mois", value: "42,8 K€", delta: "+12 %", tone: "positive", page: "numbers" as PageId },
  { label: "Marge moyenne", value: "29 %", delta: "−2,1 pts", tone: "negative", page: "numbers" as PageId },
  { label: "Trésorerie", value: "67 j", delta: "Stable", tone: "neutral", page: "numbers" as PageId },
];

export const attentionItems = [
  {
    level: "Urgent",
    tone: "danger",
    title: "24,3 K€ de factures dépassent leur délai habituel",
    detail: "Atelier Sud et Nova concentrent 83 % du montant à relancer.",
    source: "Factures · actualisé à 07:58",
    prompt: "Qui doit être relancé aujourd’hui ?",
  },
  {
    level: "À analyser",
    tone: "warning",
    title: "La marge atelier baisse depuis trois mois",
    detail: "Le chantier Rivoli explique 82 % de l’écart de cette semaine.",
    source: "Projets + temps + achats",
    prompt: "Pourquoi la marge atelier baisse ?",
  },
  {
    level: "Opportunité",
    tone: "blue",
    title: "Deux anciens clients montrent un signal de réactivation",
    detail: "Groupe Lumen et Studio Marais n’ont rien commandé depuis plus de 75 jours.",
    source: "CRM + historique commercial",
    prompt: "Quels anciens clients ont le meilleur potentiel de réactivation ?",
  },
  {
    level: "Bonne nouvelle",
    tone: "success",
    title: "Camille a signé quatre affaires ce mois",
    detail: "86 K€ de pipeline transformé, son meilleur mois depuis janvier.",
    source: "CRM · équipe commerciale",
    prompt: "Résume les performances commerciales de Camille.",
  },
];

export const missions = [
  { id: "MIS-031", title: "Relances clients en retard", progress: 72, status: "2 validations", owner: "Agent Finance", next: "Deux brouillons prêts" },
  { id: "MIS-030", title: "Analyse de marge Rivoli", progress: 100, status: "Terminée", owner: "Agent Analyse", next: "3 causes identifiées" },
  { id: "MIS-029", title: "Réactivation clients dormants", progress: 38, status: "En cours", owner: "Agent Revenu", next: "Scoring des 25 comptes" },
];

export const approvals = [
  { id: "VAL-061", title: "Envoyer 2 relances clients", risk: "Faible", meta: "Atelier Sud · Nova Hôtels", due: "Avant 10:00" },
  { id: "VAL-063", title: "Valider l’avenant Rivoli", risk: "Moyen", meta: "+6,8 K€ · protège 1,9 pt de marge", due: "Avant midi" },
];

export type AgentScenario = {
  id: string;
  label: string;
  keywords: string[];
  lead: string;
  body: string[];
  sources: string[];
  followups: string[];
  artifact?: {
    kicker: string;
    title: string;
    metrics: Array<{ label: string; value: string }>;
    action: string;
  };
};

export const agentScenarios: AgentScenario[] = [
  {
    id: "relances",
    label: "Qui dois-je relancer aujourd’hui ?",
    keywords: ["relanc", "impay", "payé", "facture", "retard"],
    lead: "Trois dossiers demandent une attention, pour un total de 24,3 K€.",
    body: [
      "Atelier Sud · 12,4 K€ · 28 jours. Relation historique : je recommande un ton direct mais chaleureux.",
      "Nova Hôtels · 7,8 K€ · 12 jours. Leur cycle de validation est dépassé : une relance ferme est justifiée.",
      "Maison Cobalt · 4,1 K€ · 8 jours. Leur dernier email demande d’attendre lundi ; je ne recommande aucune action aujourd’hui.",
    ],
    sources: ["FACT-879", "FACT-886", "FACT-890", "EMAIL-905", "RULE-002"],
    followups: ["Prépare les deux relances", "Ouvre les factures", "Montre l’historique Atelier Sud"],
    artifact: {
      kicker: "Mission proposée",
      title: "Préparer deux relances personnalisées",
      metrics: [
        { label: "Destinataires", value: "2" },
        { label: "Montant", value: "20,2 K€" },
        { label: "Action externe", value: "Validation requise" },
      ],
      action: "Préparer les brouillons",
    },
  },
  {
    id: "marge",
    label: "Pourquoi la marge atelier baisse ?",
    keywords: ["marge", "rivoli", "rentab", "écart"],
    lead: "La marge projetée passe de 31 % à 28,9 %, soit un écart de 2 520 €.",
    body: [
      "Le chantier Rivoli explique 82 % de l’écart : 14 heures non facturées représentent 630 €.",
      "L’achat de placage chêne dépasse son budget de 1 438 €.",
      "Le solde vient principalement de quatre jours de planning supplémentaires. Un avenant de 6,8 K€ protégerait 1,9 point de marge.",
    ],
    sources: ["PROJET-241", "TEMPS-086", "ACHAT-109", "FACT-882", "ALERT-201"],
    followups: ["Prépare l’avenant", "Montre le détail du projet", "Compare aux autres chantiers"],
    artifact: {
      kicker: "Analyse de cause",
      title: "82 % de l’écart expliqué",
      metrics: [
        { label: "Temps non facturé", value: "630 €" },
        { label: "Achat hors budget", value: "1 438 €" },
        { label: "Marge récupérable", value: "+1,9 pt" },
      ],
      action: "Préparer un plan correctif",
    },
  },
  {
    id: "acquisition",
    label: "Google Ads ou Meta : où investir ?",
    keywords: ["google", "meta", "ads", "facebook", "instagram", "acquisition", "budget"],
    lead: "Google Search produit aujourd’hui la demande la plus qualifiée.",
    body: [
      "Google Ads a dépensé 684 €, généré 11 leads, 4 qualifiés et 58 K€ de pipeline attribué.",
      "Meta a dépensé 312 € pour 3 leads et aucun qualifié. La créa actuelle fatigue depuis 12 jours.",
      "Je recommande de suspendre cette créa Meta et de transférer 200 € vers la campagne Search “agencement hôtel Paris”, après validation.",
    ],
    sources: ["GADS-2026-07", "META-2026-07", "OPP-401", "ALERT-203"],
    followups: ["Prépare la réallocation", "Analyse les requêtes Google", "Propose une nouvelle créa Meta"],
    artifact: {
      kicker: "Arbitrage acquisition",
      title: "Réallouer 200 € vers Google Search",
      metrics: [
        { label: "Pipeline Google", value: "58 K€" },
        { label: "Leads qualifiés Meta", value: "0" },
        { label: "Budget concerné", value: "200 €" },
      ],
      action: "Préparer la modification",
    },
  },
  {
    id: "seo",
    label: "Quelle stratégie SEO prioriser ?",
    keywords: ["seo", "référencement", "contenu", "position", "mot-clé"],
    lead: "Le meilleur actif à produire ensuite est une étude de cas Rivoli orientée “agencement hôtel Paris”.",
    body: [
      "La requête est en position 7, génère 96 clics mensuels et a déjà converti quatre fois.",
      "Le timelapse Rivoli a atteint 18 400 personnes et généré l’opportunité Studio Cime de 20 K€.",
      "Une page réunissant vidéo, chiffres de chantier, matériaux et FAQ peut soutenir SEO, Google Ads et prospection commerciale avec le même contenu source.",
    ],
    sources: ["SEO-001", "IG-492", "OPP-403", "PROJET-241", "GADS-2026-07"],
    followups: ["Écris le plan de page", "Montre les concurrents", "Crée le calendrier éditorial"],
  },
  {
    id: "thomas",
    label: "Que se passe-t-il si Thomas est absent ?",
    keywords: ["thomas", "absent", "savoir", "équipe", "compétence", "cnc"],
    lead: "Trois dépendances opérationnelles reposent encore fortement sur Thomas.",
    body: [
      "Le contrôle qualité Rivoli peut être repris par Hugo avec la procédure PROC-003.",
      "Le choix de finition Nova est documenté dans EXP-THOMAS-01 et ne présente pas de blocage immédiat.",
      "La calibration CNC reste le point de risque : la procédure est incomplète. Je recommande une session de transfert de 45 minutes et l’enregistrement d’un pas-à-pas vidéo.",
    ],
    sources: ["PER-003", "EXP-THOMAS-01", "PROC-003", "PROC-007", "TASK-642"],
    followups: ["Planifie le transfert", "Ouvre la procédure CNC", "Montre les autres dépendances humaines"],
    artifact: {
      kicker: "Risque de continuité",
      title: "Sécuriser la calibration CNC",
      metrics: [
        { label: "Dépendances", value: "3" },
        { label: "Risque fort", value: "1" },
        { label: "Transfert proposé", value: "45 min" },
      ],
      action: "Créer la session de transfert",
    },
  },
  {
    id: "strategy",
    label: "Où en sommes-nous sur la stratégie du trimestre ?",
    keywords: ["strat", "trimestre", "objectif", "priorité", "direction"],
    lead: "Le trimestre est à 84 % de son objectif de pipeline, mais la marge reste le principal écart à corriger.",
    body: [
      "Le pipeline atteint 184 K€ sur 220 K€. Le CA du mois progresse de 12 %.",
      "La marge est à 29 % contre un objectif de 32 %. Rivoli et les achats non refacturés en sont les causes principales.",
      "Les trois priorités sont : sécuriser l’avenant Rivoli, récupérer 24,3 K€ de créances et renforcer Google Search.",
    ],
    sources: ["STRAT-2026-Q3", "FIN-SNAPSHOT-20260715", "CRM-SNAPSHOT-20260715", "ALERT-201"],
    followups: ["Prépare mon brief CODIR", "Crée les trois missions", "Simule la fin du trimestre"],
  },
];

export function findScenario(prompt: string): AgentScenario {
  const normalized = prompt.toLocaleLowerCase("fr");
  const scored = agentScenarios
    .map((scenario) => ({
      scenario,
      score: scenario.keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored[0]?.score > 0) return scored[0].scenario;
  return {
    id: "general",
    label: prompt,
    keywords: [],
    lead: "J’ai rapproché les éléments disponibles dans la mémoire de l’entreprise.",
    body: [
      "La donnée la plus récente confirme un pipeline de 184 K€, une marge moyenne de 29 % et 24,3 K€ de créances à traiter.",
      "Pour répondre précisément, je peux limiter l’analyse à un client, un projet, une période ou une source particulière.",
    ],
    sources: ["CRM-SNAPSHOT-20260715", "FIN-SNAPSHOT-20260715", "STRAT-2026-Q3"],
    followups: ["Analyse les priorités du jour", "Montre les sources", "Prépare un brief de direction"],
  };
}

export const emailThreads = [
  { id: "EMAIL-901", sender: "Sophie Leclerc", company: "Atelier Sud", subject: "Re: facture de juin", preview: "Nous faisons le nécessaire cette semaine…", time: "10:24", tag: "À suivre", unread: true, linked: "FACT-879" },
  { id: "EMAIL-902", sender: "Pierre Lenoir", company: "Nova Hôtels", subject: "Duplicata et validation", preview: "Pouvez-vous me renvoyer le duplicata…", time: "09:52", tag: "Question", unread: true, linked: "FACT-886" },
  { id: "EMAIL-903", sender: "Adrien Morel", company: "Rivoli Développement", subject: "Modification du hall", preview: "La direction valide le changement de finition…", time: "Hier", tag: "Opportunité", unread: false, linked: "PROJET-241" },
  { id: "EMAIL-905", sender: "Léa Fournier", company: "Maison Cobalt", subject: "Échéance du règlement", preview: "Notre virement partira lundi prochain…", time: "Hier", tag: "Plus tard", unread: false, linked: "FACT-890" },
  { id: "EMAIL-908", sender: "Élodie Perrin", company: "Hôtel Orsay", subject: "Plans techniques", preview: "Le comité se réunit jeudi à 14 h…", time: "Lun.", tag: "Prioritaire", unread: false, linked: "OPP-401" },
];

export type OpsDocument = {
  id: string;
  name: string;
  type: string;
  linked: string;
  owner: string;
  updated: string;
  status: string;
  facts: number;
  dataUrl?: string;
  objectUrl?: string;
  url?: string;
  downloadUrl?: string;
  createdAt?: string;
  sources?: string[];
  size?: string;
  pages?: number;
  generated?: boolean;
  sourceKind?: "pdf" | "obsidian";
  vaultPath?: string;
  summary?: string;
};

export const documents: OpsDocument[] = [
  { id: "CONTRAT-241", name: "Contrat Rivoli signé", type: "Contrat", linked: "Projet Rivoli", owner: "Hugo Bernard", updated: "14 juil. · 17:42", status: "Compris", facts: 14 },
  { id: "DEV-317", name: "Devis Hôtel Orsay v3", type: "Devis", linked: "Hôtel Orsay", owner: "Camille Laurent", updated: "15 juil. · 08:12", status: "À valider", facts: 9 },
  { id: "FACT-879", name: "Facture Atelier Sud — 12 400 €", type: "Facture", linked: "Atelier Sud", owner: "Inès Martin", updated: "15 juil. · 07:58", status: "En retard", facts: 8 },
  { id: "CR-1207", name: "Compte rendu chantier Rivoli", type: "Réunion", linked: "Projet Rivoli", owner: "Hugo Bernard", updated: "12 juil. · 16:30", status: "Compris", facts: 17 },
  { id: "PROC-007", name: "Calibration CNC", type: "Procédure", linked: "Atelier", owner: "Thomas Renaud", updated: "09 juil. · 11:05", status: "Incomplet", facts: 5 },
  { id: "STRAT-2026-Q3", name: "Stratégie commerciale T3", type: "Stratégie", linked: "Direction", owner: "Marie Delmas", updated: "01 juil. · 09:00", status: "Actif", facts: 21 },
];

export const clients = [
  { id: "CLI-001", name: "Rivoli Développement", initials: "RD", owner: "Camille", revenue: "120 K€", margin: "28,9 %", last: "Hier", health: 82, status: "Actif", opportunity: "Avenant · 6,8 K€" },
  { id: "CLI-002", name: "Atelier Sud", initials: "AS", owner: "Camille", revenue: "94 K€", margin: "34 %", last: "28 j", health: 61, status: "À risque", opportunity: "Facture · 12,4 K€" },
  { id: "CLI-003", name: "Nova Hôtels", initials: "NH", owner: "Marie", revenue: "88 K€", margin: "31 %", last: "2 j", health: 76, status: "Actif", opportunity: "Extension · 72 K€" },
  { id: "CLI-004", name: "Maison Cobalt", initials: "MC", owner: "Camille", revenue: "41 K€", margin: "27 %", last: "8 j", health: 68, status: "À suivre", opportunity: "Facture · 4,1 K€" },
  { id: "CLI-005", name: "Groupe Lumen", initials: "GL", owner: "Marie", revenue: "86 K€", margin: "36 %", last: "94 j", health: 72, status: "Dormant", opportunity: "Réactivation" },
  { id: "CLI-006", name: "Studio Marais", initials: "SM", owner: "Camille", revenue: "62 K€", margin: "33 %", last: "76 j", health: 70, status: "Dormant", opportunity: "Réactivation" },
];

export const opportunities = [
  { id: "OPP-401", name: "Hôtel Orsay", amount: 58000, stage: "Proposition", probability: 72, owner: "Camille", source: "Google Ads", next: "Chiffrage final · jeu. 14 h" },
  { id: "OPP-402", name: "Maison Lenoir", amount: 34000, stage: "Découverte", probability: 48, owner: "Marie", source: "Architecte", next: "Visite technique · vendredi" },
  { id: "OPP-403", name: "Studio Cime", amount: 20000, stage: "Qualification", probability: 61, owner: "Camille", source: "Instagram", next: "Plans attendus" },
  { id: "OPP-404", name: "Extension Nova Hôtels", amount: 72000, stage: "Négociation", probability: 78, owner: "Marie", source: "Client", next: "Arbitrage budget · lundi" },
];

export const cycleStages = [
  { label: "Demandes", count: 4, value: "92 K€", progress: 100 },
  { label: "Qualification", count: 6, value: "148 K€", progress: 83 },
  { label: "Devis", count: 9, value: "221 K€", progress: 64 },
  { label: "Affaires", count: 12, value: "184 K€", progress: 48 },
  { label: "Projets", count: 7, value: "312 K€", progress: 32 },
  { label: "Factures", count: 9, value: "86,4 K€", progress: 17 },
  { label: "Paiements", count: 6, value: "62,1 K€", progress: 8 },
];

export const planningDays = ["Lun. 13", "Mar. 14", "Mer. 15", "Jeu. 16", "Ven. 17"];
export const planningRows = [
  { project: "Rivoli · atelier", owner: "Thomas + 4", tone: "blue", slots: [1, 1, 1, 1, 0] },
  { project: "Nova · finitions", owner: "Hugo + 2", tone: "peach", slots: [0, 1, 1, 0, 0] },
  { project: "Orsay · étude", owner: "Camille + Hugo", tone: "green", slots: [0, 0, 1, 1, 1] },
  { project: "CNC · maintenance", owner: "Thomas", tone: "grey", slots: [0, 0, 0, 1, 0] },
];

export const acquisitionChannels = [
  { name: "Google Ads", spend: "684 €", result: "58 K€", label: "pipeline", efficiency: 86, trend: "+18 %", tone: "blue" },
  { name: "SEO", spend: "—", result: "14", label: "leads qualifiés", efficiency: 74, trend: "+4", tone: "green" },
  { name: "Instagram", spend: "Organique", result: "20 K€", label: "pipeline", efficiency: 62, trend: "1 opportunité", tone: "violet" },
  { name: "Meta Ads", spend: "312 €", result: "0", label: "lead qualifié", efficiency: 18, trend: "À revoir", tone: "peach" },
];

export type BrainNode = {
  id: string;
  label: string;
  type: "company" | "person" | "client" | "project" | "document" | "finance" | "marketing" | "decision" | "knowledge";
  x: number;
  y: number;
  size: number;
  summary: string;
  source?: string;
};

export type BrainEdge = {
  from: string;
  to: string;
  type: "confirmed" | "influence" | "risk" | "knowledge";
};

export const brainNodes: BrainNode[] = [
  { id: "ORG-001", label: "Atelier Beaumarchais", type: "company", x: 500, y: 330, size: 34, summary: "La mémoire centrale de l’entreprise : 286 éléments reliés." },
  { id: "PER-001", label: "Marie Delmas", type: "person", x: 390, y: 210, size: 20, summary: "Direction · arbitre les décisions sensibles et la stratégie." },
  { id: "PER-002", label: "Camille Laurent", type: "person", x: 565, y: 175, size: 19, summary: "Responsable commerciale · 4 affaires signées ce mois." },
  { id: "PER-003", label: "Thomas Renaud", type: "person", x: 660, y: 290, size: 21, summary: "Chef d’atelier · détenteur de plusieurs savoirs critiques." },
  { id: "PER-004", label: "Inès Martin", type: "person", x: 585, y: 445, size: 17, summary: "Administration et finance · suit factures, paiements et trésorerie." },
  { id: "PER-005", label: "Hugo Bernard", type: "person", x: 385, y: 445, size: 18, summary: "Conducteur de travaux · responsable opérationnel Rivoli." },
  { id: "CLI-001", label: "Rivoli Développement", type: "client", x: 225, y: 270, size: 23, summary: "Client stratégique · chantier de 120 K€ actuellement à 62 %." },
  { id: "CLI-002", label: "Atelier Sud", type: "client", x: 275, y: 510, size: 19, summary: "Client historique · 12,4 K€ en retard de 28 jours." },
  { id: "CLI-003", label: "Nova Hôtels", type: "client", x: 745, y: 470, size: 22, summary: "Client actif · extension de 72 K€ en négociation." },
  { id: "CLI-005", label: "Groupe Lumen", type: "client", x: 820, y: 285, size: 17, summary: "Client dormant · 86 K€ de CA historique, potentiel de réactivation élevé." },
  { id: "PROJET-241", label: "Chantier Rivoli", type: "project", x: 120, y: 200, size: 24, summary: "Projet à 62 % · marge projetée 28,9 % contre 31 % prévue." },
  { id: "OPP-401", label: "Hôtel Orsay", type: "project", x: 700, y: 105, size: 19, summary: "Opportunité de 58 K€ issue de Google Ads." },
  { id: "OPP-404", label: "Extension Nova", type: "project", x: 865, y: 505, size: 18, summary: "Opportunité d’upsell de 72 K€ · probabilité 78 %." },
  { id: "FACT-879", label: "Facture 12,4 K€", type: "finance", x: 170, y: 590, size: 15, summary: "Facture Atelier Sud · 28 jours de retard." },
  { id: "FACT-886", label: "Facture 7,8 K€", type: "finance", x: 810, y: 590, size: 14, summary: "Facture Nova · 12 jours de retard." },
  { id: "FACT-882", label: "Facture Rivoli 28 K€", type: "finance", x: 85, y: 340, size: 15, summary: "Facture projet Rivoli incluse dans le CA de juillet." },
  { id: "TEMPS-086", label: "14 h non facturées", type: "finance", x: 110, y: 95, size: 14, summary: "Coût de 630 € expliquant une partie de l’écart de marge." },
  { id: "ACHAT-109", label: "Placage chêne", type: "finance", x: 240, y: 90, size: 14, summary: "Dépassement de budget de 1 438 € sur le chantier Rivoli." },
  { id: "CONTRAT-241", label: "Contrat Rivoli", type: "document", x: 185, y: 390, size: 13, summary: "Contrat signé et conditions commerciales du chantier." },
  { id: "CR-1207", label: "Réunion Rivoli", type: "document", x: 310, y: 145, size: 13, summary: "Compte rendu contenant les modifications demandées par le client." },
  { id: "PROC-007", label: "Procédure CNC", type: "knowledge", x: 765, y: 210, size: 16, summary: "Procédure incomplète créant une dépendance à Thomas." },
  { id: "EXP-THOMAS-01", label: "Savoir de Thomas", type: "knowledge", x: 875, y: 375, size: 18, summary: "Réglages CNC et choix des finitions documentés partiellement." },
  { id: "DEC-058", label: "Renfort atelier", type: "decision", x: 345, y: 65, size: 15, summary: "Décision urgente : renfort de trois jours pour sécuriser Rivoli." },
  { id: "DEC-063", label: "Avenant 6,8 K€", type: "decision", x: 275, y: 320, size: 16, summary: "Avenant proposé pour protéger 1,9 point de marge." },
  { id: "GADS-2026-07", label: "Google Ads", type: "marketing", x: 610, y: 65, size: 18, summary: "684 € dépensés · 58 K€ de pipeline attribué." },
  { id: "META-2026-07", label: "Meta Ads", type: "marketing", x: 940, y: 175, size: 14, summary: "312 € dépensés · aucun lead qualifié." },
  { id: "IG-492", label: "Timelapse Rivoli", type: "marketing", x: 925, y: 300, size: 16, summary: "18 400 vues · 612 enregistrements · une opportunité attribuée." },
  { id: "SEO-001", label: "SEO hôtel Paris", type: "marketing", x: 805, y: 80, size: 16, summary: "Position 7 · 96 clics mensuels · 4 conversions." },
  { id: "STRAT-2026-Q3", label: "Stratégie T3", type: "decision", x: 470, y: 555, size: 19, summary: "Objectif pipeline 220 K€ · marge cible 32 %." },
  { id: "RULE-002", label: "Règle de relance", type: "knowledge", x: 625, y: 570, size: 14, summary: "Le ton de relance dépend de l’ancienneté et de la relation client." },
];

export const brainEdges: BrainEdge[] = [
  { from: "ORG-001", to: "PER-001", type: "confirmed" },
  { from: "ORG-001", to: "PER-002", type: "confirmed" },
  { from: "ORG-001", to: "PER-003", type: "confirmed" },
  { from: "ORG-001", to: "PER-004", type: "confirmed" },
  { from: "ORG-001", to: "PER-005", type: "confirmed" },
  { from: "PER-002", to: "CLI-002", type: "confirmed" },
  { from: "PER-002", to: "OPP-401", type: "confirmed" },
  { from: "PER-001", to: "STRAT-2026-Q3", type: "confirmed" },
  { from: "PER-003", to: "PROC-007", type: "knowledge" },
  { from: "PER-003", to: "EXP-THOMAS-01", type: "knowledge" },
  { from: "CLI-001", to: "PROJET-241", type: "confirmed" },
  { from: "PROJET-241", to: "FACT-882", type: "confirmed" },
  { from: "PROJET-241", to: "TEMPS-086", type: "risk" },
  { from: "PROJET-241", to: "ACHAT-109", type: "risk" },
  { from: "PROJET-241", to: "CONTRAT-241", type: "confirmed" },
  { from: "PROJET-241", to: "CR-1207", type: "confirmed" },
  { from: "PROJET-241", to: "DEC-058", type: "risk" },
  { from: "PROJET-241", to: "DEC-063", type: "risk" },
  { from: "CLI-002", to: "FACT-879", type: "risk" },
  { from: "CLI-002", to: "RULE-002", type: "knowledge" },
  { from: "CLI-003", to: "FACT-886", type: "risk" },
  { from: "CLI-003", to: "OPP-404", type: "confirmed" },
  { from: "GADS-2026-07", to: "OPP-401", type: "influence" },
  { from: "SEO-001", to: "GADS-2026-07", type: "influence" },
  { from: "IG-492", to: "PROJET-241", type: "influence" },
  { from: "META-2026-07", to: "ORG-001", type: "influence" },
  { from: "STRAT-2026-Q3", to: "GADS-2026-07", type: "confirmed" },
  { from: "STRAT-2026-Q3", to: "PROJET-241", type: "risk" },
];

export const companyContext = `
Contexte d’entreprise : Atelier Beaumarchais, menuiserie et agencement sur mesure, Paris 11, 18 personnes. Dirigeante : Marie Delmas.
Chiffres au 17 juillet 2026 : pipeline 184 000 €, CA du mois 42 800 €, marge 29 % (−2,1 points), visibilité de trésorerie 67 jours, créances en retard 24 300 €.
Pipeline : Hôtel Orsay 58 000 € (Google Ads), Maison Lenoir 34 000 € (architecte), Studio Cime 20 000 € (Instagram), extension Nova Hôtels 72 000 €.
Rivoli : projet 120 000 €, avancement 62 %, marge prévue 31 %, projetée 28,9 %. 14 heures non facturées coûtent 630 €. Achat de placage : budget 8 202 €, réel 9 640 €, écart 1 438 €. Ces deux causes expliquent 82 % de l’écart.
Factures en retard : Atelier Sud 12 400 € / 28 jours ; Nova 7 800 € / 12 jours ; Maison Cobalt 4 100 € / 8 jours mais son dernier email demande d’attendre lundi.
Acquisition : Google Ads 684 € dépensés, 11 leads, 4 qualifiés, 58 000 € de pipeline. Meta 312 €, 3 leads, aucun qualifié. Instagram timelapse Rivoli : 18 400 vues, 612 enregistrements, opportunité Studio Cime 20 000 €. SEO “agencement hôtel Paris” : position 7, 96 clics mensuels, 4 conversions.
Validations : VAL-061 autorise deux relances déjà préparées, Atelier Sud 12 400 € et Nova Hôtels 7 800 €, soit 20 200 € au total. Maison Cobalt est exclue car son email EMAIL-905 demande d’attendre lundi. VAL-063 concerne l’avenant Rivoli de 6 800 € qui protège environ 1,9 point de marge.
Règles : toute action externe exige une validation. Les affirmations importantes doivent citer les identifiants des sources entre crochets. Ne jamais inventer une donnée manquante.
`;
