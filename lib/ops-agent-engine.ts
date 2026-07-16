import { findScenario, type AgentScenario } from "@/lib/ops-demo-data";
import {
  extractMemoryIds,
  findConversationMemory,
  getMemoryRecord,
  getRelatedMemory,
  normalizeMemoryQuery,
  resolveImplicitMemory,
  searchCompanyMemory,
  type AgentHistoryTurn,
} from "@/lib/ops-memory";

function reply(id: string, label: string, lead: string, body: string[], sources: string[], followups: string[]): AgentScenario {
  return { id, label, keywords: [], lead, body, sources, followups };
}

const MARGIN_EXPLANATION_SOURCE_IDS = ["PROJET-241", "TEMPS-086", "ACHAT-109", "FACT-882", "ALERT-201"];

export type PdfRequestResolution = {
  requested: boolean;
  needsClarification: boolean;
  title: string | null;
  topic: string | null;
  sourceIds: string[];
  contextId: string | null;
};

function isSimpleGreeting(normalized: string) {
  return /^(?:(?:bonjour|bonsoir|salut|hello|coucou|hey)[!,. ]*)?(?:ca va|comment (?:ca va|vas.tu|tu vas|allez.vous|vous allez)|(?:est.ce que )?tu vas bien|vous allez bien)[!,.? ]*$/.test(normalized)
    || /^(bonjour|bonsoir|salut|hello|coucou|hey)[!,.? ]*$/.test(normalized);
}

function isGreetingCorrection(normalized: string, history: AgentHistoryTurn[]) {
  const objectsToWellbeingQuestion = /\bpas demande\b.*\b(?:si|comment)\b.*\b(?:tu|vous)\b.*\b(?:allais|vas|allez|va|bien)\b/.test(normalized)
    || /\b(?:ne|n.)?me demande pas\b.*\b(?:si|comment)\b.*\b(?:je vais|ca va)\b/.test(normalized);
  if (!objectsToWellbeingQuestion) return false;

  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  if (!lastAssistant) return true;
  const assistantText = normalizeMemoryQuery(lastAssistant.content);
  return /\b(?:et vous|et toi|ca va bien|tu vas bien|vous allez bien)\b/.test(assistantText);
}

function isImplicitFollowup(normalized: string) {
  return /^(?:et\b|alors\b|donc\b|qu.en est.il\b|(?:montre|explique|detaille|resume|compare|ouvre|continue|approfondis|fais)\b)/.test(normalized)
    || /\b(?:cela|ca|ce point|cette analyse|le precedent|la precedente)\b/.test(normalized);
}

function explicitPdfTopic(prompt: string) {
  const cleaned = prompt.trim();
  if (/rapport(?:\s+de\s+direction|\s+annuel|\s+d'entreprise)?\s+2026/i.test(cleaned)) return "Rapport de direction 2026";
  if (/brief\s+(codir|direction)/i.test(cleaned)) return "Brief CODIR — 15 juillet 2026";
  if (/strat[eé]gie/i.test(cleaned)) return "Stratégie de direction — 90 jours";
  if (/simulation/i.test(cleaned)) return "Simulation de fin de trimestre 2026";
  if (/fiche\s+compte/i.test(cleaned)) return "Fiche compte direction";

  const remainder = cleaned
    .replace(/(?:peux[- ]tu|tu peux|merci de|s'il te plaît|stp|produis|produire|génère|générer|crée|créer|fais[- ]moi|fait[- ]moi|fais|fait|moi|un|une|le|la|pdf|document|rapport)/gi, " ")
    .replace(/\b(?:explicatif|exaplicatif|explicative|exaplicative|explication|détaillé|détaillée|detaille|detaillee|complet|complète|complete|clair|claire|dessus|précédent|précédente|precedent|precedente|cela|ça|ca)\b/gi, " ")
    .replace(/\b(?:sur|du|de|des|à propos)\b/gi, " ")
    .replace(/[-–—_:;,.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder.length >= 4 ? remainder[0].toLocaleUpperCase("fr") + remainder.slice(1) : null;
}

export function resolvePdfRequest(prompt: string, history: AgentHistoryTurn[] = []): PdfRequestResolution {
  if (!asksForPdf(prompt)) {
    return { requested: false, needsClarification: false, title: null, topic: null, sourceIds: [], contextId: null };
  }

  const normalized = normalizeMemoryQuery(prompt);
  const directMarginRequest = /\b(marge|rentabilite|rivoli)\b/.test(normalized);
  const conversationRecords = findConversationMemory(history, 12);
  const conversationIds = new Set(conversationRecords.map((record) => record.id));
  const hasMarginContext = MARGIN_EXPLANATION_SOURCE_IDS.some((id) => conversationIds.has(id));

  if (directMarginRequest) {
    return {
      requested: true,
      needsClarification: false,
      title: "Rapport explicatif — baisse de marge atelier",
      topic: "Baisse de marge du chantier Rivoli",
      sourceIds: MARGIN_EXPLANATION_SOURCE_IDS,
      contextId: "PROJET-241",
    };
  }

  const explicitTopic = explicitPdfTopic(prompt);
  if (explicitTopic) {
    const records = searchCompanyMemory(prompt, history, 8);
    return {
      requested: true,
      needsClarification: false,
      title: explicitTopic,
      topic: explicitTopic,
      sourceIds: records.map((record) => record.id),
      contextId: records[0]?.id ?? null,
    };
  }

  if (hasMarginContext) {
    return {
      requested: true,
      needsClarification: false,
      title: "Rapport explicatif — baisse de marge atelier",
      topic: "Baisse de marge du chantier Rivoli",
      sourceIds: MARGIN_EXPLANATION_SOURCE_IDS,
      contextId: "PROJET-241",
    };
  }

  if (conversationRecords.length) {
    const primary = conversationRecords[0];
    return {
      requested: true,
      needsClarification: false,
      title: `Rapport explicatif — ${primary.title}`,
      topic: primary.summary,
      sourceIds: conversationRecords.slice(0, 8).map((record) => record.id),
      contextId: primary.id,
    };
  }

  return { requested: true, needsClarification: true, title: null, topic: null, sourceIds: [], contextId: null };
}

function approvalScenario(id: "VAL-061" | "VAL-063", prompt: string) {
  if (id === "VAL-061") {
    return reply(
      "validation-061",
      prompt,
      "VAL-061 autorise l’envoi de deux relances déjà préparées, pour 20,2 K€ au total.",
      [
        "Atelier Sud · 12,4 K€ · 28 jours de retard. Le brouillon reste direct mais chaleureux, car la relation est ancienne et le client annonce un traitement cette semaine.",
        "Nova Hôtels · 7,8 K€ · 12 jours de retard. Le cycle habituel est dépassé : le message est plus ferme et joint le duplicata demandé.",
        "Maison Cobalt n’est pas incluse. Son dernier email annonce un virement lundi ; la relancer aujourd’hui contredirait l’engagement enregistré.",
        "Le risque est faible : aucun prix, contrat ou engagement nouveau n’est modifié. En revanche, RULE-001 interdit tout envoi externe avant la validation explicite de Marie.",
      ],
      ["VAL-061", "MIS-031", "FACT-879", "EMAIL-901", "FACT-886", "EMAIL-902", "FACT-890", "EMAIL-905", "RULE-001", "RULE-002"],
      ["Montre les deux brouillons", "Compare le ton des relances", "Quels contrôles avant envoi ?"],
    );
  }

  return reply(
    "validation-063",
    prompt,
    "VAL-063 porte sur l’avenant Rivoli de 6,8 K€ et protège environ 1,9 point de marge.",
    [
      "Le client a confirmé le changement de finition sous réserve de chiffrage. L’avenant transforme cette modification en périmètre facturable.",
      "Sans avenant, la marge du chantier reste projetée à 28,9 % contre 31 % initialement. La décision est attendue avant midi.",
      "Le risque est moyen : le document engage le client. OPS peut préparer l’envoi, mais Marie doit relire le montant, le périmètre et l’échéancier avant validation.",
    ],
    ["VAL-063", "PROJET-241", "DEC-063", "EMAIL-903", "CR-1207", "ALERT-201", "RULE-001"],
    ["Montre l’avenant", "Décompose les 6,8 K€", "Que se passe-t-il si je refuse ?"],
  );
}

function recordScenario(id: string, prompt: string): AgentScenario | null {
  const record = getMemoryRecord(id);
  if (!record) return null;
  if (record.id === "VAL-061" || record.id === "VAL-063") return approvalScenario(record.id, prompt);
  const related = getRelatedMemory(record).slice(0, 5);
  return reply(
    `record-${record.id.toLocaleLowerCase("fr")}`,
    prompt,
    `${record.id} — ${record.title}`,
    [record.summary, ...record.facts, related.length ? `Éléments directement reliés : ${related.map((item) => `${item.id} (${item.title})`).join(", ")}.` : ""].filter(Boolean),
    [record.id, ...related.map((item) => item.id)],
    [`Montre les relations de ${record.id}`, `Quelle décision dépend de ${record.id} ?`, `Génère une fiche PDF de ${record.id}`],
  );
}

export function buildFallbackScenario(prompt: string, history: AgentHistoryTurn[] = []): AgentScenario {
  const normalized = normalizeMemoryQuery(prompt);
  const explicitIds = extractMemoryIds(prompt);
  const explicitId = explicitIds.find((candidate) => getMemoryRecord(candidate));
  if (explicitIds.length && !explicitId) {
    return reply(
      "unknown-record",
      prompt,
      `${explicitIds[0]} n’existe pas dans la mémoire disponible.`,
      ["Je ne le remplace pas par un autre dossier. Vérifiez l’identifiant ou indiquez le client, le projet ou le document recherché."],
      [],
      ["Recherche les validations en attente", "Ouvre le Cerveau", "Que dois-je valider aujourd’hui ?"],
    );
  }
  if (explicitId) {
    const recordMatch = recordScenario(explicitId, prompt);
    if (recordMatch) return recordMatch;
  }

  if (isSimpleGreeting(normalized)) {
    return reply(
      "greeting",
      prompt,
      "Salut Marie. Ça va bien, merci. Et vous ?",
      [],
      [],
      ["Que dois-je valider aujourd’hui ?", "Analyse les priorités du jour", "Prépare mon brief CODIR"],
    );
  }

  if (isGreetingCorrection(normalized, history)) {
    return reply(
      "conversation-repair",
      prompt,
      "Vous avez raison — vous m’avez simplement dit bonjour.",
      ["Je n’avais pas à vous retourner la question. Je vous écoute."],
      [],
      ["Que souhaitez-vous examiner ?", "Ouvrir les validations", "Faire le point sur l’entreprise"],
    );
  }

  if (/^(merci|parfait|ok|d.accord|tres bien|très bien)(\s|[!,.?]|$)/.test(normalized)) {
    return reply("acknowledgement", prompt, "Avec plaisir.", ["Je garde le contexte de cette conversation. Dites-moi simplement la prochaine décision ou le prochain livrable à préparer."], [], ["Continue", "Résume la décision", "Prépare la suite"]);
  }

  const pdfRequest = resolvePdfRequest(prompt, history);
  if (pdfRequest.requested) {
    if (pdfRequest.needsClarification || !pdfRequest.title) {
      return reply(
        "pdf-clarification",
        prompt,
        "D’accord. Quel sujet doit expliquer le PDF ?",
        ["Vous pouvez préciser un client, un projet, une validation ou reprendre l’analyse précédente."],
        [],
        ["Le rapport de direction 2026", "La baisse de marge atelier", "La validation VAL-061"],
      );
    }

    return reply(
      "pdf-generation",
      prompt,
      `Je prépare « ${pdfRequest.title} » à partir du contexte de cette conversation.`,
      [
        pdfRequest.contextId === "PROJET-241"
          ? "Le document expliquera l’écart entre la marge prévue et la marge projetée, les heures non facturées, le dépassement d’achat, la situation de facturation et l’alerte de marge."
          : `Le document sera centré sur ${pdfRequest.topic ?? pdfRequest.title}, sans élargir artificiellement l’analyse.`,
        "Chaque conclusion sera reliée aux sources utilisées avant la génération du fichier.",
      ],
      pdfRequest.sourceIds,
      ["Génère le PDF", "Montre d’abord le plan", "Ajoute les recommandations"],
    );
  }

  if (/que dois.je valider|validation.*aujourd|validations? en attente/.test(normalized)) {
    return reply(
      "pending-validations",
      prompt,
      "Deux validations demandent votre décision avant midi.",
      [
        "VAL-061 · Envoyer deux relances clients · 20,2 K€ concernés · risque faible · avant 10 h.",
        "VAL-063 · Avenant Rivoli de 6,8 K€ · protège 1,9 point de marge · risque moyen · avant midi.",
        "Ordre recommandé : examiner d’abord VAL-061, car les brouillons sont prêts et l’impact cash est immédiat ; traiter ensuite l’avenant Rivoli.",
      ],
      ["VAL-061", "VAL-063", "MIS-031", "PROJET-241", "RULE-001"],
      ["Explique VAL-061", "Explique VAL-063", "Prépare mon arbitrage"],
    );
  }

  if (/brouillon/.test(normalized) && history.some((turn) => turn.content.includes("VAL-061"))) {
    return reply(
      "validation-061-drafts",
      prompt,
      "Les deux brouillons de VAL-061 sont prêts ; aucun message n’est encore parti.",
      [
        "Atelier Sud · Objet : “Point sur la facture de juin”. Ton chaleureux, rappel du montant de 12,4 K€ et demande d’une date de virement précise.",
        "Nova Hôtels · Objet : “Duplicata et échéance de la facture”. Ton ferme, duplicata joint, rappel des 7,8 K€ et demande de validation du règlement aujourd’hui.",
        "Contrôle restant : vérifier les pièces jointes, les destinataires et la date promise avant de valider l’envoi.",
      ],
      ["VAL-061", "MIS-031", "FACT-879", "EMAIL-901", "FACT-886", "EMAIL-902", "RULE-001", "RULE-002"],
      ["Compare phrase par phrase", "Valide seulement Atelier Sud", "Quels risques avant envoi ?"],
    );
  }

  if (/brief|codir|comite de direction/.test(normalized)) {
    return reply(
      "brief-codir",
      prompt,
      "Brief CODIR — trois décisions méritent votre temps aujourd’hui.",
      [
        "Décision 1 · Valider l’avenant Rivoli de 6,8 K€ avant midi. Il protège 1,9 point de marge et traite l’écart le plus important du portefeuille.",
        "Décision 2 · Autoriser les relances Atelier Sud et Nova. Elles représentent 20,2 K€ sur les 24,3 K€ de créances en retard ; Maison Cobalt doit attendre lundi conformément à son dernier message.",
        "Décision 3 · Déplacer 200 € de Meta vers Google Search. Search a déjà créé 58 K€ de pipeline tandis que Meta n’a produit aucun lead qualifié.",
        "Point d’équipe · La calibration CNC reste dépendante de Thomas. Une session de transfert de 45 minutes doit être planifiée cette semaine.",
      ],
      ["STRAT-2026-Q3", "ALERT-201", "FACT-879", "FACT-886", "GADS-2026-07", "PROC-007"],
      ["Génère ce brief en PDF", "Crée les trois missions", "Simule l’impact à 90 jours"],
    );
  }

  if (/cree?.*(mission|tache)|trois missions|plan d.action/.test(normalized)) {
    return reply(
      "create-missions",
      prompt,
      "Trois missions sont prêtes, avec un responsable, une échéance et une règle d’arrêt.",
      [
        "MIS-032 · Protéger la marge Rivoli — Hugo — échéance aujourd’hui 12 h. Résultat attendu : avenant de 6,8 K€ prêt à valider.",
        "MIS-033 · Récupérer les créances — Inès — échéance aujourd’hui 10 h. Deux brouillons préparés ; aucun envoi sans validation de Marie.",
        "MIS-034 · Réallouer l’acquisition — Camille — échéance vendredi. Préparer le transfert de 200 € vers Search et une nouvelle hypothèse créative Meta.",
      ],
      ["DEC-063", "FACT-879", "FACT-886", "GADS-2026-07", "META-2026-07"],
      ["Montre le détail de MIS-032", "Prépare les validations", "Transforme ce plan en PDF"],
    );
  }

  if (/simul|projection|fin du trimestre|fin de trimestre|scenario/.test(normalized)) {
    return reply(
      "quarter-simulation",
      prompt,
      "Scénario central : 216 K€ de pipeline et une marge remontée à 30,7 % en fin de trimestre.",
      [
        "Hypothèse basse · Sans avenant Rivoli et sans réallocation média : 201 K€ de pipeline, marge à 29,2 % et 18 K€ de créances encore ouvertes.",
        "Hypothèse centrale · Avenant validé, relances exécutées et Search renforcé : 216 K€ de pipeline, marge à 30,7 % et créances ramenées sous 8 K€.",
        "Hypothèse haute · Extension Nova signée en plus du scénario central : objectif de 220 K€ dépassé et visibilité de trésorerie portée à environ 82 jours.",
        "La variable la plus sensible n’est pas le volume de leads : c’est la conversion de Nova et la protection de la marge Rivoli.",
      ],
      ["STRAT-2026-Q3", "OPP-404", "DEC-063", "FIN-SNAPSHOT-20260715", "GADS-2026-07"],
      ["Compare les hypothèses", "Génère la simulation en PDF", "Quelles décisions sécurisent le scénario central ?"],
    );
  }

  if (/source|preuve|d.ou vient|fiabilite|confiance/.test(normalized)) {
    return reply(
      "source-ledger",
      prompt,
      "Les conclusions reposent sur neuf enregistrements reliés ; aucun chiffre principal ne dépend d’une source unique non confirmée.",
      [
        "Pipeline et opportunités : CRM-SNAPSHOT-20260715, OPP-401 et OPP-404.",
        "Marge Rivoli : PROJET-241 rapproché de TEMPS-086, ACHAT-109 et FACT-882.",
        "Créances : FACT-879, FACT-886 et EMAIL-905. Le message Maison Cobalt modifie volontairement la priorité de relance.",
        "Acquisition : GADS-2026-07 et META-2026-07, avec attribution au pipeline plutôt qu’aux clics seuls.",
      ],
      ["CRM-SNAPSHOT-20260715", "PROJET-241", "TEMPS-086", "ACHAT-109", "FACT-879", "FACT-886", "GADS-2026-07", "META-2026-07"],
      ["Ouvre le graphe de preuves", "Montre les données manquantes", "Génère le registre des sources"],
    );
  }

  if (/priorite|aujourd.hui|comprendre de l.entreprise|etat de l.entreprise|matin/.test(normalized)) {
    return reply(
      "daily-direction",
      prompt,
      "L’entreprise vend correctement ; le sujet du jour est de transformer cette activité en marge et en cash.",
      [
        "Avant 10 h · Valider deux relances représentant 20,2 K€. Maison Cobalt n’est pas à relancer aujourd’hui : son email annonce un paiement lundi.",
        "Avant midi · Arbitrer l’avenant Rivoli de 6,8 K€. C’est la seule décision capable de récupérer presque deux points de marge à court terme.",
        "Cet après-midi · Confirmer le transfert de 200 € vers Google Search, puis planifier le transfert de savoir CNC avec Thomas.",
        "Signal positif · Le pipeline atteint 184 K€ et Camille réalise son meilleur mois ; il n’y a pas de problème de demande globale.",
      ],
      ["CRM-SNAPSHOT-20260715", "FIN-SNAPSHOT-20260715", "DEC-063", "FACT-879", "FACT-886", "GADS-2026-07", "PROC-007"],
      ["Prépare mon brief CODIR", "Crée les trois missions", "Génère le rapport du jour en PDF"],
    );
  }

  if (/strategie|plan strategique|feuille de route|90 jours/.test(normalized) && !/seo|google|meta|ads/.test(normalized)) {
    return reply(
      "strategy-90d",
      prompt,
      "Je recommande une stratégie en quatre chantiers, séquencée sur 90 jours.",
      [
        "1. Marge · Rendre obligatoire le rattachement des heures et achats à chaque projet, puis sécuriser immédiatement l’avenant Rivoli.",
        "2. Cash · Installer une revue hebdomadaire des créances avec relance différenciée selon l’historique client et les engagements écrits.",
        "3. Acquisition · Concentrer le budget sur Google Search, transformer Rivoli en actif SEO et utiliser Meta uniquement en retargeting tant que la qualité n’est pas rétablie.",
        "4. Mémoire · Documenter la calibration CNC et les exceptions commerciales afin que les décisions ne dépendent plus de Thomas ou de Marie.",
        "Indicateurs de succès à J+90 : marge supérieure à 31 %, créances sous 8 K€, pipeline au-dessus de 220 K€ et aucune procédure critique détenue par une seule personne.",
      ],
      ["STRAT-2026-Q3", "ALERT-201", "FIN-SNAPSHOT-20260715", "GADS-2026-07", "SEO-001", "PROC-007"],
      ["Génère cette stratégie en PDF", "Crée les missions associées", "Simule les trois scénarios"],
    );
  }

  if (/nova|atelier sud|maison cobalt|groupe lumen|studio marais|hotel orsay/.test(normalized)) {
    const account = normalized.includes("nova") ? "Nova Hôtels" : normalized.includes("atelier sud") ? "Atelier Sud" : normalized.includes("cobalt") ? "Maison Cobalt" : normalized.includes("lumen") ? "Groupe Lumen" : normalized.includes("marais") ? "Studio Marais" : "Hôtel Orsay";
    return reply(
      "account-summary",
      prompt,
      `${account} mérite une lecture relationnelle, pas seulement financière.`,
      [
        account === "Nova Hôtels" ? "Le compte représente 88 K€ sur douze mois et porte une extension de 72 K€ en négociation à 78 %. La facture de 7,8 K€ a dépassé son cycle de validation habituel." : `${account} est relié au CRM, aux échanges récents et aux opportunités correspondantes. OPS distingue le potentiel commercial du risque de trésorerie.`,
        "La prochaine action recommandée est préparée à partir du dernier échange disponible ; toute prise de contact externe reste soumise à validation.",
      ],
      ["CRM-SNAPSHOT-20260715", "EMAIL-902", "OPP-404", "FACT-886"],
      ["Prépare l’appel", "Montre la chronologie", "Génère une fiche compte PDF"],
    );
  }

  if (isImplicitFollowup(normalized)) {
    const contextualRecords = resolveImplicitMemory(prompt, history, 8);
    const primary = contextualRecords[0];
    if (primary) {
      const contextualScenario = recordScenario(primary.id, prompt);
      if (contextualScenario) return contextualScenario;
    }
  }

  const scenario = findScenario(prompt);
  if (scenario.id !== "general") return scenario;

  const retrieved = searchCompanyMemory(prompt, history, 5);
  if (retrieved.length) {
    const [primary, ...related] = retrieved;
    return reply(
      "memory-search",
      prompt,
      `J’ai trouvé ${retrieved.length} élément${retrieved.length > 1 ? "s" : ""} pertinent${retrieved.length > 1 ? "s" : ""} dans la mémoire.`,
      [primary.summary, ...primary.facts.slice(0, 3), related.length ? `À rapprocher de : ${related.map((record) => `${record.id} — ${record.title}`).join(" ; ")}.` : ""].filter(Boolean),
      retrieved.map((record) => record.id),
      [`Approfondis ${primary.id}`, "Montre seulement les faits confirmés", "Prépare la prochaine décision"],
    );
  }

  return reply(
    "contextual-general",
    prompt,
    "Je n’ai pas trouvé de fait suffisamment précis pour répondre sans inventer.",
    [
      "Indiquez l’identifiant, le client, le projet ou la période concernée. Par exemple : “Explique VAL-061”, “Résume Nova Hôtels” ou “Analyse la marge de juillet”.",
    ],
    [],
    ["Que dois-je valider aujourd’hui ?", "Analyse les priorités du jour", "Recherche dans la mémoire"],
  );
}

export function extractPdfTopic(prompt: string, history: AgentHistoryTurn[] = []) {
  return resolvePdfRequest(prompt, history).title;
}

export function asksForPdf(prompt: string) {
  return /\b(pdf|rapport|document)\b/i.test(prompt) && /(produ|g[eé]n[eè]r|cr[eé]|fai[st]|pr[eé]pare|transforme|exporte|relance)/i.test(prompt);
}
