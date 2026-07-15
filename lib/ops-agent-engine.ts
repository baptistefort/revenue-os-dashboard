import { findScenario, type AgentScenario } from "@/lib/ops-demo-data";

function reply(id: string, label: string, lead: string, body: string[], sources: string[], followups: string[]): AgentScenario {
  return { id, label, keywords: [], lead, body, sources, followups };
}

export function buildFallbackScenario(prompt: string): AgentScenario {
  const normalized = prompt.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

  const scenario = findScenario(prompt);
  if (scenario.id !== "general") return scenario;

  return reply(
    "contextual-general",
    prompt,
    "Je peux répondre, mais je distingue d’abord le fait établi de l’hypothèse de travail.",
    [
      "Faits établis : pipeline de 184 K€, marge moyenne de 29 %, 24,3 K€ de créances et visibilité de trésorerie de 67 jours.",
      "Hypothèse utile : votre question semble toucher à une décision de direction. Je peux l’analyser par client, projet, période, équipe ou canal d’acquisition sans perdre les sources utilisées.",
      "Donnez-moi simplement le résultat attendu — décider, expliquer, planifier, comparer ou produire un document — et je construis la réponse dans ce format.",
    ],
    ["CRM-SNAPSHOT-20260715", "FIN-SNAPSHOT-20260715", "STRAT-2026-Q3"],
    ["Analyse les priorités du jour", "Prépare mon brief CODIR", "Produis un rapport PDF"],
  );
}

export function extractPdfTopic(prompt: string) {
  const cleaned = prompt.trim();
  if (/rapport(?:\s+de\s+direction|\s+annuel|\s+d'entreprise)?\s+2026/i.test(cleaned)) return "Rapport de direction 2026";
  if (/brief\s+(codir|direction)/i.test(cleaned)) return "Brief CODIR — 15 juillet 2026";
  if (/strategie/i.test(cleaned)) return "Stratégie de direction — 90 jours";
  if (/simulation/i.test(cleaned)) return "Simulation de fin de trimestre 2026";
  if (/fiche\s+compte/i.test(cleaned)) return "Fiche compte direction";

  const remainder = cleaned
    .replace(/(?:peux[- ]tu|tu peux|merci de|s'il te plaît|stp|produis|produire|génère|générer|crée|créer|fais[- ]moi|moi|un|une|le|la|pdf|document|rapport)/gi, " ")
    .replace(/[-–—_:;,.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder.length >= 4 ? remainder[0].toLocaleUpperCase("fr") + remainder.slice(1) : null;
}

export function asksForPdf(prompt: string) {
  return /\b(pdf|rapport|document)\b/i.test(prompt) && /(produ|g[eé]n[eè]r|cr[eé]|fais|pr[eé]pare|transforme|exporte)/i.test(prompt);
}
