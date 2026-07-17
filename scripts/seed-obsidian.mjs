import { promises as fs } from "node:fs";
import path from "node:path";

const vault = process.env.OBSIDIAN_VAULT_PATH;
if (!vault) throw new Error("OBSIDIAN_VAULT_PATH is required");

const memoryRootName = "OPS — Atelier Beaumarchais";
const root = path.basename(path.resolve(vault)) === memoryRootName
  ? path.resolve(vault)
  : path.join(vault, memoryRootName);
const org = "ORG-001 — Atelier Beaumarchais";

const records = [];
const add = (folder, id, type, title, summary, links = [], extra = {}, body = "") => records.push({
  folder,
  id,
  type,
  title,
  summary,
  links,
  extra,
  body,
});

// Conserver les noms déjà présents dans le coffre pour qu'un nouveau seed
// mette les notes à jour au lieu de créer un second fichier avec le même id.
const safeFileName = (value) => value
  .replaceAll("/", "-")
  .replace(/\u0000/g, "")
  .trim();

const frontmatterValue = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(frontmatterValue).join(", ")}]`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(String(value));
};

async function preservedOperationalContent(filePath, id) {
  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }

  if (id === "INDEX") {
    return existing.match(/\n## Éléments créés par l'application[\s\S]*$/)?.[0]?.trim() ?? "";
  }
  if (id === "LOG") {
    const firstApplicationCommit = existing.search(/^## \[[^\]]+\] commit \| [^\n]+$/m);
    return firstApplicationCommit >= 0
      ? existing.slice(firstApplicationCommit).trim()
      : "";
  }
  return "";
}

add("00_System", "ORG-001", "company", "Atelier Beaumarchais", "Menuiserie et agencement sur mesure à Paris 11. Dix-huit personnes, une mémoire OPS et un système de validation humaine.", [], { status: "active", employees: 18, city: "Paris 11" });
add("00_System", "MANIFEST", "knowledge", "Manifest de la mémoire OPS", "Ce coffre expose les connaissances durables de l’entreprise et leur provenance.", [org], { managed: true, resettable: false });
add(
  "00_System",
  "SCHEMA",
  "knowledge",
  "Contrat de mémoire OPS",
  "Contrat structurel qui sépare les preuves brutes, les synthèses maintenues et les écritures opérationnelles de l’application.",
  [org, "INDEX — Index de la mémoire OPS", "LOG — Journal de la mémoire OPS", "MANIFEST — Manifest de la mémoire OPS"],
  { schema_version: 2, status: "maintained" },
  `## Trois couches

- 01_Raw contient les preuves datées et immuables : snapshots, emails reçus, rapports de campagnes et données opérationnelles.
- 11_Wiki contient les synthèses maintenues qui rapprochent plusieurs preuves sans les remplacer.
- Les dossiers métier contiennent les objets opérationnels : clients, opportunités, tâches, documents et décisions.

## Identité et relations

- Chaque note possède un identifiant unique et stable.
- Chaque fait décisionnel reste relié à au moins une source primaire.
- Toute écriture créée ou modifiée par OPS est reliée à l'entreprise, indexée dans INDEX et inscrite dans LOG.
- Une analyse produite par OpenCode est une synthèse réutilisable ; elle ne devient jamais une preuve primaire.

## Contrôle de qualité

La commande \`npm run memory:lint\` vérifie les identifiants dupliqués, les liens cassés, les notes orphelines et les métadonnées obligatoires.`,
);

[
  ["PER-001", "Marie Delmas", "Direction", "Arbitre la stratégie, les budgets et les actions externes sensibles."],
  ["PER-002", "Camille Laurent", "Responsable commerciale", "A signé quatre affaires ce mois et pilote les comptes stratégiques."],
  ["PER-003", "Thomas Renaud", "Chef d’atelier", "Douze ans d’ancienneté. Détient le savoir critique sur la CNC et les finitions."],
  ["PER-004", "Inès Martin", "Administration et finance", "Suit les factures, les paiements, la marge et la trésorerie."],
  ["PER-005", "Hugo Bernard", "Conducteur de travaux", "Suit Rivoli et peut reprendre une partie du contrôle qualité."],
].forEach(([id, title, role, summary]) => add("02_Direction/Equipe", id, "person", title, summary, [org], { role }));

const clientRows = [
  ["CLI-001", "Rivoli Développement", "Actif", 120000, 28.9, 82, "Hier", "Avenant · 6,8 K€", "Camille", "adrien.morel@rivoli-developpement.fr", "[[PROJET-241 — Chantier Rivoli]]", "Client stratégique, chantier à 62 % et avenant à valider."],
  ["CLI-002", "Atelier Sud", "À risque", 94000, 34, 61, "28 j", "Facture · 12,4 K€", "Camille", "sophie.leclerc@atelier-sud.fr", "[[FACT-879 — Atelier Sud — 12400 EUR]]", "Client historique avec une facture en retard de 28 jours."],
  ["CLI-003", "Nova Hôtels", "Actif", 88000, 31, 76, "2 j", "Extension · 72 K€", "Marie", "pierre.lenoir@nova-hotels.fr", "[[OPP-404 — Extension Nova Hôtels]]", "Client actif avec une extension de 72 K€ en négociation."],
  ["CLI-004", "Maison Cobalt", "À suivre", 41000, 27, 68, "8 j", "Facture · 4,1 K€", "Camille", "lea.fournier@maison-cobalt.fr", "[[FACT-890 — Maison Cobalt — 4100 EUR]]", "Relation sensible. Le dernier email demande d’attendre lundi."],
  ["CLI-005", "Groupe Lumen", "Dormant", 86000, 36, 72, "94 j", "Réactivation", "Marie", "direction@groupe-lumen.fr", "[[DEC-071 — Réactiver Groupe Lumen]]", "Aucune commande depuis 94 jours, aucun litige, potentiel fort."],
  ["CLI-006", "Studio Marais", "Dormant", 62000, 33, 70, "76 j", "Réactivation", "Camille", "contact@studio-marais.fr", "[[DEC-072 — Réactiver Studio Marais]]", "Aucune commande depuis 76 jours, historique de projets récurrents."],
];
clientRows.forEach(([id, title, status, revenue, margin, health, last, opportunity, owner, email, relation, summary]) => add(
  "03_CRM/Clients",
  id,
  "client",
  title,
  summary,
  [org, String(relation).replace(/\[\[|\]\]/g, "")],
  {
    record_kind: "client",
    status,
    owner,
    revenue_12m: revenue,
    margin_percent: margin,
    health_score: health,
    last_interaction: last,
    next_opportunity: opportunity,
    email,
  },
));

[
  ["OPP-401", "Hôtel Orsay", 58000, "Proposition", 72, "Camille", "Google Ads", "Chiffrage final · jeu. 14 h", "Hôtel Orsay", "[[GADS-2026-07 — Agencement hôtel Paris]]"],
  ["OPP-402", "Maison Lenoir", 34000, "Découverte", 48, "Marie", "Architecte", "Visite technique · vendredi", "Maison Lenoir", "[[STRAT-2026-Q3 — Stratégie commerciale T3]]"],
  ["OPP-403", "Studio Cime", 20000, "Qualification", 61, "Camille", "Instagram", "Plans attendus", "Studio Cime", "[[IG-492 — Timelapse chantier Rivoli]]"],
  ["OPP-404", "Extension Nova Hôtels", 72000, "Négociation", 78, "Marie", "Client", "Arbitrage budget · lundi", "Nova Hôtels", "[[CLI-003 — Nova Hôtels]]"],
].forEach(([id, title, amount, stage, probability, owner, source, next, company, link]) => add(
  "03_CRM/Opportunites",
  id,
  "project",
  title,
  `Opportunité de ${Number(amount).toLocaleString("fr-FR")} € au stade ${stage}, origine ${source}.`,
  [org, String(link).replace(/\[\[|\]\]/g, ""), "PER-002 — Camille Laurent"],
  {
    record_kind: "opportunity",
    amount,
    stage,
    probability,
    owner,
    source_channel: source,
    next_action: next,
    company,
    status: "open",
  },
));

[
  ["PROJET-241", "Chantier Rivoli", "CLI-001 — Rivoli Développement", 120000, 62, "Projet stratégique. Marge prévue 31 %, projetée 28,9 %.", ["TEMPS-086 — 14 heures non facturées", "ACHAT-109 — Placage chêne", "CONTRAT-241 — Rivoli signé", "DEC-063 — Avenant Rivoli 6800 EUR"]],
  ["PROJET-233", "Banque accueil Atelier Sud", "CLI-002 — Atelier Sud", 48000, 100, "Projet terminé et livré, historique de relation positif.", ["FACT-879 — Atelier Sud — 12400 EUR"]],
  ["PROJET-246", "Finitions Nova", "CLI-003 — Nova Hôtels", 36000, 78, "Échantillons corrigés promis pour le 18 juillet.", ["CALL-709 — Point Nova Hôtels", "EXP-THOMAS-01 — Réglages CNC et finitions"]],
  ["PROJET-250", "Étude Hôtel Orsay", "OPP-401 — Hôtel Orsay", 58000, 24, "Étude technique avant chiffrage final.", ["DEV-317 — Devis Hôtel Orsay v3", "CALL-711 — Découverte Hôtel Orsay"]],
].forEach(([id, title, client, value, progress, summary, links]) => add("06_Operations/Projets", id, "project", title, summary, [org, String(client), "PER-005 — Hugo Bernard", ...links], { value, progress }));

[
  ["FACT-879", "Atelier Sud — 12400 EUR", "CLI-002 — Atelier Sud", 12400, 28, "Facture en retard. Une relance douce est recommandée."],
  ["FACT-882", "Rivoli — 28000 EUR", "PROJET-241 — Chantier Rivoli", 28000, 0, "Facture de juillet, comprise dans le CA mensuel."],
  ["FACT-886", "Nova Hôtels — 7800 EUR", "CLI-003 — Nova Hôtels", 7800, 12, "Cycle de validation client dépassé, relance ferme recommandée."],
  ["FACT-890", "Maison Cobalt — 4100 EUR", "CLI-004 — Maison Cobalt", 4100, 8, "Attendre lundi conformément au dernier email."],
  ["FACT-893", "Maintenance — 2900 EUR", org, 2900, 0, "Facture en cours de règlement."],
].forEach(([id, title, client, amount, overdue, summary]) => add("07_Finance/Factures", id, "finance", title, summary, [org, String(client), "PER-004 — Inès Martin"], { amount, overdue_days: overdue }));

add("06_Operations/Temps", "TEMPS-086", "finance", "14 heures non facturées", "Quatorze heures non facturées sur Rivoli représentent un coût de 630 €.", [org, "PROJET-241 — Chantier Rivoli", "PER-003 — Thomas Renaud"], { hours: 14, cost: 630, billable: false });
add("06_Operations/Achats", "ACHAT-109", "finance", "Placage chêne", "Budget 8 202 €, dépense réelle 9 640 €, dépassement 1 438 €.", [org, "PROJET-241 — Chantier Rivoli"], { budget: 8202, actual: 9640, variance: 1438 });

[
  ["CONTRAT-241", "Rivoli signé", "Contrat signé de 120 K€ et conditions de modification du périmètre.", ["CLI-001 — Rivoli Développement", "PROJET-241 — Chantier Rivoli"]],
  ["BDC-241", "Bon de commande Rivoli", "Bon de commande initial validant le lancement du chantier.", ["PROJET-241 — Chantier Rivoli", "CONTRAT-241 — Rivoli signé"]],
  ["PLAN-241-B", "Plan atelier Rivoli version B", "Version utilisée par l’atelier depuis le 8 juillet.", ["PROJET-241 — Chantier Rivoli", "PER-003 — Thomas Renaud"]],
  ["CR-1207", "Compte rendu chantier Rivoli", "Modifications de finition et besoin d’un avenant de 6,8 K€.", ["PROJET-241 — Chantier Rivoli", "DEC-063 — Avenant Rivoli 6800 EUR"]],
  ["DEV-317", "Devis Hôtel Orsay v3", "Chiffrage de 58 K€ soumis au plan technique final.", ["OPP-401 — Hôtel Orsay", "PER-002 — Camille Laurent"]],
  ["PROC-003", "Contrôle qualité atelier", "Procédure suffisamment documentée pour être reprise par Hugo.", ["PER-003 — Thomas Renaud", "PER-005 — Hugo Bernard"]],
  ["PROC-007", "Calibration CNC", "Procédure encore incomplète : elle ne couvre pas les réglages de finition.", ["PER-003 — Thomas Renaud", "EXP-THOMAS-01 — Réglages CNC et finitions"]],
  ["EXP-THOMAS-01", "Réglages CNC et finitions", "Savoir documenté partiellement lors d’un transfert en atelier.", ["PER-003 — Thomas Renaud", "PROC-007 — Calibration CNC"]],
].forEach(([id, title, summary, links]) => add("08_Documents", id, id.startsWith("EXP") ? "knowledge" : "document", title, summary, [org, ...links]));

const seededEmailContacts = {
  "EMAIL-912": { sender: "Claire Dumont", sender_email: "claire@studio-cime.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Studio Cime" },
  "EMAIL-913": { sender: "Google Ads", sender_email: "ads-noreply@google.com", recipient: "marie@atelier-beaumarchais.fr", company: "Google Ads" },
  "EMAIL-914": { sender: "Lucie Bernard", sender_email: "lucie@agence-web.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Agence Web" },
  "EMAIL-915": { sender: "Julie Martin", sender_email: "julie.martin@client.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Cliente Rivoli" },
  "EMAIL-916": { sender: "Mathieu Rey", sender_email: "mathieu@bois-matieres.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Bois & Matières" },
  "EMAIL-918": { sender: "Adrien Morel", sender_email: "adrien.morel@rivoli-developpement.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Rivoli Développement" },
  "EMAIL-919": { sender: "Élodie Perrin", sender_email: "elodie.perrin@hotel-orsay.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Hôtel Orsay" },
  "EMAIL-920": { sender: "Mathieu Rey", sender_email: "mathieu@bois-matieres.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Bois & Matières" },
  "EMAIL-921": { sender: "Cabinet Audial", sender_email: "dossier@audial-expertise.fr", recipient: "marie@atelier-beaumarchais.fr", company: "Audial Expertise" },
};

[
  ["EMAIL-901", "Sophie Leclerc — Facture de juin", "Atelier Sud indique que le règlement sera traité cette semaine.", "Sophie Leclerc", "sophie.leclerc@atelier-sud.fr", "Atelier Sud", "2026-07-16T10:24:00+02:00", "positive", ["CLI-002 — Atelier Sud", "FACT-879 — Atelier Sud — 12400 EUR"]],
  ["EMAIL-902", "Pierre Lenoir — Duplicata Nova", "Nova demande un duplicata et n’a pas obtenu de délai supplémentaire.", "Pierre Lenoir", "pierre.lenoir@nova-hotels.fr", "Nova Hôtels", "2026-07-16T09:52:00+02:00", "question", ["CLI-003 — Nova Hôtels", "FACT-886 — Nova Hôtels — 7800 EUR"]],
  ["EMAIL-903", "Modification client Rivoli", "Le client valide le changement de finition, sous réserve de chiffrage.", "Adrien Morel", "adrien.morel@rivoli-developpement.fr", "Rivoli Développement", "2026-07-15T16:38:00+02:00", "positive", ["PROJET-241 — Chantier Rivoli", "DEC-063 — Avenant Rivoli 6800 EUR"]],
  ["EMAIL-905", "Maison Cobalt — échéance", "Le virement partira lundi prochain. Ne pas relancer avant cette date.", "Léa Fournier", "lea.fournier@maison-cobalt.fr", "Maison Cobalt", "2026-07-15T15:17:00+02:00", "later", ["CLI-004 — Maison Cobalt", "FACT-890 — Maison Cobalt — 4100 EUR"]],
  ["EMAIL-908", "Hôtel Orsay — plans techniques", "Le comité d’investissement se réunit jeudi à 14 h.", "Élodie Perrin", "elodie.perrin@hotel-orsay.fr", "Hôtel Orsay", "2026-07-15T11:08:00+02:00", "priority", ["OPP-401 — Hôtel Orsay", "DEV-317 — Devis Hôtel Orsay v3"]],
  ["EMAIL-910", "Architecte Lenoir — recommandation", "Introduction auprès de Maison Lenoir et contexte du besoin.", "Nicolas Lenoir", "nicolas@atelier-lenoir.fr", "Atelier Lenoir", "2026-07-15T09:41:00+02:00", "positive", ["OPP-402 — Maison Lenoir", "PER-002 — Camille Laurent"]],
].forEach(([id, title, summary, sender, senderEmail, company, receivedAt, classification, links]) => add(
  "04_Conversations/Emails",
  id,
  "document",
  title,
  summary,
  [org, ...links],
  {
    record_kind: "email",
    direction: "inbound",
    mailbox: "inbox",
    classification,
    status: "to_process",
    sender,
    sender_email: senderEmail,
    recipient: "marie@atelier-beaumarchais.fr",
    company,
    received_at: receivedAt,
  },
));

[
  ["CALL-709", "Point Nova Hôtels", "Échantillons corrigés promis le 18 juillet, duplicata de facture à envoyer.", ["CLI-003 — Nova Hôtels", "PROJET-246 — Finitions Nova"]],
  ["CALL-711", "Découverte Hôtel Orsay", "Besoin confirmé, décision avant le 24 juillet, comité jeudi.", ["OPP-401 — Hôtel Orsay", "DEV-317 — Devis Hôtel Orsay v3"]],
  ["MEET-120", "Revue de marge Rivoli", "Décision de préparer un avenant et de suivre les heures non facturées.", ["PROJET-241 — Chantier Rivoli", "TEMPS-086 — 14 heures non facturées", "DEC-063 — Avenant Rivoli 6800 EUR"]],
  ["MEET-122", "CODIR du 14 juillet", "Trois priorités : marge Rivoli, créances, Google Search.", ["STRAT-2026-Q3 — Stratégie commerciale T3", "GADS-2026-07 — Agencement hôtel Paris"]],
].forEach(([id, title, summary, links]) => add("04_Conversations/Reunions", id, "document", title, summary, [org, ...links]));

[
  ["GADS-2026-07", "Agencement hôtel Paris", "684 € dépensés, 126 clics, 11 leads, 4 qualifiés, 58 K€ de pipeline.", ["OPP-401 — Hôtel Orsay", "SEO-001 — Agencement hôtel Paris"]],
  ["META-2026-07", "Retargeting portfolio", "312 € dépensés, 3 leads, aucun qualifié. Créa à suspendre.", ["ALERT-203 — Qualité leads Meta", "STRAT-2026-Q3 — Stratégie commerciale T3"]],
  ["IG-492", "Timelapse chantier Rivoli", "18 400 vues, 612 enregistrements et opportunité Studio Cime de 20 K€.", ["PROJET-241 — Chantier Rivoli", "OPP-403 — Studio Cime"]],
  ["SEO-001", "Agencement hôtel Paris", "Position 7, 96 clics mensuels et 4 conversions.", ["GADS-2026-07 — Agencement hôtel Paris", "PROJET-241 — Chantier Rivoli"]],
  ["CONTENT-088", "Étude de cas Rivoli", "Actif proposé pour réunir vidéo, chiffres, SEO et preuve commerciale.", ["SEO-001 — Agencement hôtel Paris", "IG-492 — Timelapse chantier Rivoli", "PROJET-241 — Chantier Rivoli"]],
].forEach(([id, title, summary, links]) => add("09_Marketing", id, "marketing", title, summary, [org, ...links]));

[
  ["STRAT-2026-Q3", "Stratégie commerciale T3", "Objectif pipeline 220 K€, marge cible 32 %, visibilité de trésorerie supérieure à 60 jours.", ["CRM-SNAPSHOT-20260715 — Pipeline", "FIN-SNAPSHOT-20260715 — Finance"]],
  ["DEC-058", "Renfort atelier Rivoli", "Décision urgente : ajouter trois jours de renfort atelier.", ["PROJET-241 — Chantier Rivoli", "PER-003 — Thomas Renaud"]],
  ["DEC-061", "Relances clients", "Autoriser deux relances, Atelier Sud et Nova, après lecture des brouillons.", ["FACT-879 — Atelier Sud — 12400 EUR", "FACT-886 — Nova Hôtels — 7800 EUR"]],
  ["DEC-063", "Avenant Rivoli 6800 EUR", "Avenant proposé pour protéger 1,9 point de marge.", ["PROJET-241 — Chantier Rivoli", "EMAIL-903 — Modification client Rivoli"]],
  ["DEC-071", "Réactiver Groupe Lumen", "Client dormant à prioriser : 86 K€ de CA historique, aucun litige.", ["CLI-005 — Groupe Lumen", "CRM-SNAPSHOT-20260715 — Pipeline"]],
  ["DEC-072", "Réactiver Studio Marais", "Deuxième client dormant à réactiver selon son cycle habituel.", ["CLI-006 — Studio Marais", "CRM-SNAPSHOT-20260715 — Pipeline"]],
  ["ALERT-201", "Écart de marge Rivoli", "La marge projetée a baissé de 2,1 points. 82 % de l’écart est expliqué.", ["PROJET-241 — Chantier Rivoli", "TEMPS-086 — 14 heures non facturées", "ACHAT-109 — Placage chêne"]],
  ["ALERT-202", "Créances en retard", "24,3 K€ de factures dépassent leur délai habituel.", ["FACT-879 — Atelier Sud — 12400 EUR", "FACT-886 — Nova Hôtels — 7800 EUR", "FACT-890 — Maison Cobalt — 4100 EUR"]],
  ["ALERT-203", "Qualité leads Meta", "Aucun des trois leads Meta de juillet n’est qualifié.", ["META-2026-07 — Retargeting portfolio", "GADS-2026-07 — Agencement hôtel Paris"]],
].forEach(([id, title, summary, links]) => add("02_Direction/Decisions-et-alertes", id, "decision", title, summary, [org, "PER-001 — Marie Delmas", ...links]));

[
  ["VAL-061", "Envoyer deux relances clients", "Validation attendue avant l’envoi des relances Atelier Sud et Nova Hôtels. Montant total concerné : 20,2 K€. Maison Cobalt reste en attente jusqu’à lundi.", ["DEC-061 — Relances clients", "FACT-879 — Atelier Sud — 12400 EUR", "EMAIL-901 — Sophie Leclerc — Facture de juin", "FACT-886 — Nova Hôtels — 7800 EUR", "EMAIL-902 — Pierre Lenoir — Duplicata Nova", "FACT-890 — Maison Cobalt — 4100 EUR", "EMAIL-905 — Maison Cobalt — échéance", "RULE-001 — Aucune action externe sans validation", "RULE-002 — Ton des relances"]],
  ["VAL-063", "Valider l’avenant Rivoli", "Validation attendue pour l’avenant Rivoli de 6,8 K€, destiné à protéger environ 1,9 point de marge après les changements de finition.", ["DEC-063 — Avenant Rivoli 6800 EUR", "PROJET-241 — Chantier Rivoli", "EMAIL-903 — Modification client Rivoli", "CR-1207 — Compte rendu chantier Rivoli", "ALERT-201 — Écart de marge Rivoli", "RULE-001 — Aucune action externe sans validation"]],
].forEach(([id, title, summary, links]) => add("02_Direction/Validations", id, "validation", title, summary, [org, "PER-001 — Marie Delmas", ...links], { status: "pending", external_action: true }));

[
  ["RULE-001", "Aucune action externe sans validation", "Toute action vers un client, un prospect ou un partenaire exige la validation de Marie."],
  ["RULE-002", "Ton des relances", "Le ton dépend de l’ancienneté, de la relation et du dernier échange client."],
  ["RULE-003", "Remise supérieure à 8 pour cent", "Toute remise commerciale supérieure à 8 % exige une validation de direction."],
  ["RULE-004", "Devis supérieur à 25000 EUR", "Tout devis supérieur à 25 K€ nécessite une revue de marge."],
  ["RULE-005", "Source obligatoire", "Toute affirmation OPS importante doit rester reliée à sa source."],
].forEach(([id, title, summary]) => add("10_Connaissance/Regles", id, "knowledge", title, summary, [org, "PER-001 — Marie Delmas"]));

[
  ["TASK-641", "Contrôle qualité Rivoli", "PER-005 — Hugo Bernard", "PROJET-241 — Chantier Rivoli", "Rivoli · atelier", 2, "2026-07-15"],
  ["TASK-642", "Calibration CNC", "PER-003 — Thomas Renaud", "PROC-007 — Calibration CNC", "CNC · maintenance", 3, "2026-07-16"],
  ["TASK-643", "Chiffrage Hôtel Orsay", "PER-002 — Camille Laurent", "OPP-401 — Hôtel Orsay", "Orsay · étude", 4, "2026-07-17"],
  ["TASK-644", "Duplicata Nova", "PER-004 — Inès Martin", "FACT-886 — Nova Hôtels — 7800 EUR", "Nova · finitions", 1, "2026-07-14"],
  ["TASK-645", "Brouillon relance Atelier Sud", "PER-004 — Inès Martin", "FACT-879 — Atelier Sud — 12400 EUR", "Atelier Sud · suivi", 2, "2026-07-15"],
  ["TASK-646", "Étude de cas Rivoli", "PER-002 — Camille Laurent", "CONTENT-088 — Étude de cas Rivoli", "Rivoli · atelier", 4, "2026-07-17"],
].forEach(([id, title, owner, related, project, dayIndex, due]) => add(
  "06_Operations/Taches",
  id,
  "project",
  title,
  `Tâche opérationnelle assignée à ${String(owner).replace(/^PER-\d+ — /, "")}.`,
  [org, String(owner), String(related)],
  {
    record_kind: "task",
    status: "open",
    owner: String(owner).replace(/^PER-\d+ — /, ""),
    project,
    day_index: dayIndex,
    week_offset: 0,
    due,
  },
));

[
  ["CRM-SNAPSHOT-20260715", "Pipeline", "Pipeline ouvert : 184 K€ répartis sur quatre opportunités.", ["OPP-401 — Hôtel Orsay", "OPP-402 — Maison Lenoir", "OPP-403 — Studio Cime", "OPP-404 — Extension Nova Hôtels"]],
  ["FIN-SNAPSHOT-20260715", "Finance", "CA du mois 42,8 K€, marge 29 %, trésorerie 67 jours, créances 24,3 K€.", ["FACT-882 — Rivoli — 28000 EUR", "FACT-886 — Nova Hôtels — 7800 EUR", "FACT-890 — Maison Cobalt — 4100 EUR", "FACT-893 — Maintenance — 2900 EUR"]],
  ["SYNTH-2026-W29", "Synthèse hebdomadaire W29", "Rivoli, créances clients et acquisition Search sont les trois thèmes de la semaine.", ["ALERT-201 — Écart de marge Rivoli", "ALERT-202 — Créances en retard", "GADS-2026-07 — Agencement hôtel Paris"]],
  ["BRIEF-20260715", "Brief dirigeant du 15 juillet", "Trois décisions avant midi et quatre événements à surveiller.", ["DEC-058 — Renfort atelier Rivoli", "DEC-061 — Relances clients", "DEC-063 — Avenant Rivoli 6800 EUR"]],
].forEach(([id, title, summary, links]) => add("12_Syntheses", id, "decision", title, summary, [org, ...links]));

// Chronologie réaliste : ces snapshots permettent des comparaisons explicites
// "aujourd'hui / hier" sans demander au modèle d'inventer une valeur absente.
add(
  "01_Raw/Finance",
  "FIN-SNAPSHOT-20260714",
  "finance",
  "Finance du 14 juillet 2026",
  "Au 14 juillet : CA mensuel 41,9 K€, marge moyenne 29,4 %, visibilité de trésorerie 68 jours et créances échues 24,3 K€.",
  [org, "FACT-879 — Atelier Sud — 12400 EUR", "FACT-886 — Nova Hôtels — 7800 EUR", "FACT-890 — Maison Cobalt — 4100 EUR"],
  { period: "2026-07-14", revenue_month: 41900, margin_percent: 29.4, cash_visibility_days: 68, overdue_receivables: 24300 },
  `## Indicateurs

- Chiffre d'affaires facturé du mois : 41 900 €.
- Marge moyenne projetée : 29,4 %.
- Visibilité de trésorerie : 68 jours.
- Créances échues : 24 300 €.
- Encaissements du jour : 3 100 €.

## Lecture

La marge reste sous la cible de 32 %. Les retards Atelier Sud, Nova Hôtels et Maison Cobalt constituent encore l'intégralité des créances échues.`,
);

add(
  "01_Raw/Finance",
  "FIN-SNAPSHOT-20260716",
  "finance",
  "Finance du 16 juillet 2026",
  "Au 16 juillet : CA mensuel 43,6 K€, marge moyenne 28,9 %, visibilité de trésorerie 66 jours, créances échues 24,3 K€ dont 20,2 K€ à relancer immédiatement.",
  [org, "FIN-SNAPSHOT-20260715 — Finance", "FACT-879 — Atelier Sud — 12400 EUR", "FACT-886 — Nova Hôtels — 7800 EUR", "VAL-061 — Envoyer deux relances clients"],
  { period: "2026-07-16", revenue_month: 43600, margin_percent: 28.9, cash_visibility_days: 66, overdue_receivables: 24300, immediately_actionable_receivables: 20200 },
  `## Indicateurs

- Chiffre d'affaires facturé du mois : 43 600 €, soit +800 € depuis le 15 juillet.
- Marge moyenne projetée : 28,9 %, soit -0,1 point depuis le 15 juillet et -0,5 point depuis le 14 juillet.
- Visibilité de trésorerie : 66 jours.
- Créances comptablement échues : 24 300 €.
- Montant à relancer immédiatement : 20 200 € sur Atelier Sud et Nova Hôtels.
- Maison Cobalt reste échue pour 4 100 €, mais sa relance est suspendue jusqu'à lundi conformément à son email.

## Alerte

La progression du chiffre d'affaires ne compense pas la dérive de marge du chantier Rivoli.`,
);

add(
  "01_Raw/CRM",
  "CRM-SNAPSHOT-20260714",
  "project",
  "Pipeline du 14 juillet 2026",
  "Le pipeline ouvert s'élevait à 176 K€ sur quatre opportunités, pour une valeur pondérée de 118,7 K€.",
  [org, "OPP-401 — Hôtel Orsay", "OPP-402 — Maison Lenoir", "OPP-403 — Studio Cime", "OPP-404 — Extension Nova Hôtels"],
  { period: "2026-07-14", open_pipeline: 176000, weighted_pipeline: 118680, opportunities: 4 },
  `## État du pipeline

- Hôtel Orsay : 50 K€, probabilité 68 %.
- Maison Lenoir : 34 K€, probabilité 48 %.
- Studio Cime : 20 K€, probabilité 61 %.
- Extension Nova Hôtels : 72 K€, probabilité 78 %.

## Évolution attendue

Le chiffrage final Hôtel Orsay devait être révisé après réception des plans techniques.`,
);

add(
  "01_Raw/CRM",
  "CRM-SNAPSHOT-20260716",
  "project",
  "Pipeline du 16 juillet 2026",
  "Le pipeline ouvert atteint 184 K€ sur quatre opportunités, pour une valeur pondérée de 126,4 K€.",
  [org, "CRM-SNAPSHOT-20260715 — Pipeline", "OPP-401 — Hôtel Orsay", "OPP-402 — Maison Lenoir", "OPP-403 — Studio Cime", "OPP-404 — Extension Nova Hôtels"],
  { period: "2026-07-16", open_pipeline: 184000, weighted_pipeline: 126440, opportunities: 4, conversion_rate_90d: 31 },
  `## État du pipeline

- Hôtel Orsay : 58 K€, probabilité 72 %, prochaine étape jeudi à 14 h.
- Maison Lenoir : 34 K€, probabilité 48 %, visite technique vendredi.
- Studio Cime : 20 K€, probabilité 61 %, plans attendus.
- Extension Nova Hôtels : 72 K€, probabilité 78 %, arbitrage budget lundi.

## Écart depuis le 14 juillet

Le pipeline progresse de 8 K€, entièrement grâce à la révision du chiffrage Hôtel Orsay. La prévision pondérée progresse de 7,8 K€.`,
);

const seoDaily = [
  {
    id: "SEO-SNAPSHOT-20260714",
    date: "2026-07-14",
    clicks: 412,
    impressions: 14880,
    ctr: 2.77,
    averagePosition: 14.2,
    hotelPosition: 8.4,
    hotelClicks: 79,
    conversions: 3,
    summary: "Au 14 juillet, le SEO totalise 412 clics sur 28 jours et la requête « agencement hôtel Paris » se situe en position moyenne 8,4.",
  },
  {
    id: "SEO-SNAPSHOT-20260715",
    date: "2026-07-15",
    clicks: 428,
    impressions: 15240,
    ctr: 2.81,
    averagePosition: 13.8,
    hotelPosition: 7.6,
    hotelClicks: 88,
    conversions: 4,
    summary: "Au 15 juillet, le SEO totalise 428 clics sur 28 jours et la requête « agencement hôtel Paris » progresse en position moyenne 7,6.",
  },
  {
    id: "SEO-SNAPSHOT-20260716",
    date: "2026-07-16",
    clicks: 447,
    impressions: 15820,
    ctr: 2.83,
    averagePosition: 13.4,
    hotelPosition: 7.1,
    hotelClicks: 96,
    conversions: 4,
    summary: "Au 16 juillet, le SEO totalise 447 clics sur 28 jours et la requête « agencement hôtel Paris » atteint la position moyenne 7,1.",
  },
];

for (const item of seoDaily) {
  add(
    "01_Raw/Marketing/SEO",
    item.id,
    "marketing",
    `SEO quotidien du ${item.date.split("-").reverse().join("/")}`,
    item.summary,
    [
      org,
      "SEO-001 — Agencement hôtel Paris",
      item.id === "SEO-SNAPSHOT-20260714" ? "CONTENT-088 — Étude de cas Rivoli" : `SEO-SNAPSHOT-${String(Number(item.date.replaceAll("-", "")) - 1)} — SEO quotidien`,
    ],
    {
      channel: "SEO",
      period: item.date,
      window: "28d",
      clicks: item.clicks,
      impressions: item.impressions,
      ctr_percent: item.ctr,
      average_position: item.averagePosition,
      focus_keyword_position: item.hotelPosition,
      focus_keyword_clicks: item.hotelClicks,
      conversions: item.conversions,
    },
    `## Google Search Console — fenêtre glissante de 28 jours

- Clics organiques : ${item.clicks}.
- Impressions : ${item.impressions.toLocaleString("fr-FR")}.
- CTR moyen : ${String(item.ctr).replace(".", ",")} %.
- Position moyenne du site : ${String(item.averagePosition).replace(".", ",")}.
- Requête « agencement hôtel Paris » : position ${String(item.hotelPosition).replace(".", ",")}, ${item.hotelClicks} clics et ${item.conversions} conversions attribuées.
- Part des clics non-marque : ${item.date === "2026-07-14" ? "75,5" : item.date === "2026-07-15" ? "76,2" : "77,0"} %.

## Pages qui progressent

- /agencement-hotel-paris : ${item.date === "2026-07-14" ? 132 : item.date === "2026-07-15" ? 141 : 149} clics sur 28 jours.
- /realisations/rivoli : ${item.date === "2026-07-14" ? 48 : item.date === "2026-07-15" ? 55 : 63} clics sur 28 jours.
- /menuiserie-sur-mesure-paris : ${item.date === "2026-07-14" ? 71 : item.date === "2026-07-15" ? 73 : 76} clics sur 28 jours.`,
  );
}

add(
  "01_Raw/Marketing/SEO",
  "SEO-TECH-20260716",
  "marketing",
  "Audit SEO technique du 16 juillet",
  "126 pages sont indexées sur 131 indexables. Trois erreurs 404 et deux pages exclues par canonical demandent une correction.",
  [org, "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026", "CONTENT-088 — Étude de cas Rivoli"],
  { period: "2026-07-16", indexed_pages: 126, indexable_pages: 131, errors_404: 3, lcp_mobile_seconds: 2.7, inp_mobile_ms: 182, cls_mobile: 0.06 },
  `## Couverture

- 126 pages indexées sur 131 indexables.
- 3 URL retournent une erreur 404 : deux anciennes réalisations et une page fournisseur.
- 2 pages sont exclues par une canonical incohérente.
- Aucun blocage robots.txt détecté.

## Core Web Vitals mobile

- LCP médian : 2,7 s, légèrement au-dessus de la cible de 2,5 s.
- INP médian : 182 ms, conforme.
- CLS : 0,06, conforme.

## Priorités techniques

- Corriger les trois redirections cassées avant le 18 juillet.
- Compresser l'image héro de la page /agencement-hotel-paris : économie estimée 410 Ko.
- Réaligner les deux canonical sur leurs URL publiques.`,
);

add(
  "01_Raw/Marketing/SEO",
  "SEO-CONTENT-20260716",
  "marketing",
  "Analyse de contenu SEO du 16 juillet",
  "Sept pages présentent un potentiel court terme. L'étude de cas Rivoli est l'actif prioritaire car elle peut renforcer SEO, Ads, Instagram et prospection.",
  [org, "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026", "CONTENT-088 — Étude de cas Rivoli", "IG-492 — Timelapse chantier Rivoli", "GADS-2026-07 — Agencement hôtel Paris"],
  { period: "2026-07-16", audited_pages: 24, priority_pages: 7, cannibalizations: 2, missing_case_studies: 3 },
  `## Opportunités éditoriales

- 24 pages de service et de réalisation auditées.
- 7 pages peuvent gagner au moins trois positions avec une amélioration ciblée.
- 2 cas de cannibalisation : « menuiserie hôtel Paris » et « agencement boutique Paris ».
- 3 projets livrés n'ont encore aucune étude de cas indexable.

## Priorité numéro 1

Publier l'étude de cas Rivoli avec : contexte du chantier, contraintes, matériaux, chronologie, chiffres de production, galerie, vidéo, FAQ et preuve client. Potentiel estimé à 55–80 clics organiques additionnels par mois après stabilisation.

## Maillage interne

Créer huit liens internes vers l'étude de cas depuis les pages Hôtel, Agencement sur mesure, Réalisations, Matériaux et quatre articles existants.`,
);

add(
  "01_Raw/Marketing/SEO",
  "SEO-LOCAL-20260716",
  "marketing",
  "SEO local et Google Business Profile du 16 juillet",
  "La fiche Google Business Profile a généré 91 visites du site et 37 appels sur 28 jours. La note moyenne est de 4,8 sur 67 avis.",
  [org, "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026", "CLI-001 — Rivoli Développement"],
  { period: "2026-07-16", profile_views: 1284, website_clicks: 91, calls: 37, direction_requests: 12, rating: 4.8, reviews: 67 },
  `## Performance locale — 28 jours

- 1 284 vues de fiche.
- 91 clics vers le site.
- 37 appels.
- 12 demandes d'itinéraire.
- Note moyenne 4,8/5 sur 67 avis.
- 3 nouveaux avis ce mois, tous répondus.

## Requêtes locales principales

- « menuisier sur mesure paris 11 » : 186 impressions.
- « agencement hôtel paris » : 143 impressions.
- « menuiserie boutique paris » : 98 impressions.

## Action recommandée

Publier le chantier Rivoli sur la fiche avec six photos géolocalisées et solliciter un avis détaillé après réception.`,
);

add(
  "01_Raw/Marketing/SEO",
  "SEO-COMP-20260716",
  "marketing",
  "Concurrence SEO du 16 juillet",
  "Atelier Beaumarchais progresse mais reste derrière Atelier Saint-Paul et Maison Forma sur les requêtes hôtelières à forte intention.",
  [org, "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026", "SEO-CONTENT-20260716 — Analyse de contenu SEO du 16 juillet"],
  { period: "2026-07-16", tracked_keywords: 42, top_3_keywords: 6, top_10_keywords: 17, competitors: 4 },
  `## Visibilité sur 42 requêtes suivies

- 6 mots-clés dans le top 3.
- 17 mots-clés dans le top 10.
- Part de visibilité estimée : 18,6 %, contre 17,2 % la semaine précédente.

## Concurrents

- Atelier Saint-Paul : 24,1 % de visibilité, forte autorité éditoriale.
- Maison Forma : 21,8 %, études de cas hôtelières très complètes.
- Studio Ligne : 15,4 %, bonne couverture locale mais contenu technique faible.
- Atelier Beaumarchais : 18,6 %, meilleure progression hebdomadaire du groupe.

## Angle de différenciation

Documenter les contraintes opérationnelles et les résultats chiffrés de chaque chantier plutôt que publier uniquement des galeries visuelles.`,
);

add(
  "01_Raw/Marketing/GEO",
  "GEO-SNAPSHOT-20260716",
  "marketing",
  "Visibilité dans les moteurs IA du 16 juillet",
  "Atelier Beaumarchais est cité dans 5 réponses sur 12 requêtes de référence, contre 3 sur 12 lors du contrôle précédent.",
  [org, "SEO-LOCAL-20260716 — SEO local et Google Business Profile du 16 juillet", "SEO-CONTENT-20260716 — Analyse de contenu SEO du 16 juillet"],
  { period: "2026-07-16", tested_prompts: 12, citations: 5, previous_citations: 3, citation_rate_percent: 41.7 },
  `## Audit de citation

- 12 requêtes évaluées dans trois moteurs génératifs.
- 5 réponses citent Atelier Beaumarchais, contre 3 au précédent contrôle.
- Présence forte sur « menuisier sur mesure Paris 11 ».
- Absence sur « spécialiste agencement hôtel Île-de-France » et « entreprise agencement boutique premium Paris ».

## Sources reprises par les moteurs

- Google Business Profile et avis clients.
- Page /agencement-hotel-paris.
- Mention presse locale du chantier Bastille.

## Prochaine action

Créer une page de référence « Méthode d'agencement hôtelier » avec définitions, chiffres, délais types, FAQ et auteurs identifiés.`,
);

const acquisitionDaily = [
  ["GADS-DAILY-20260714", "2026-07-14", 612, 111, 9, 3, 50000],
  ["GADS-DAILY-20260715", "2026-07-15", 684, 126, 11, 4, 58000],
  ["GADS-DAILY-20260716", "2026-07-16", 731, 139, 12, 5, 66000],
];
for (const [id, period, spend, clicks, leads, qualified, pipeline] of acquisitionDaily) {
  add(
    "01_Raw/Marketing/Ads",
    id,
    "marketing",
    `Google Ads quotidien du ${String(period).split("-").reverse().join("/")}`,
    `${Number(spend)} € dépensés sur le mois, ${Number(clicks)} clics, ${Number(leads)} leads, ${Number(qualified)} qualifiés et ${(Number(pipeline) / 1000).toLocaleString("fr-FR")} K€ de pipeline attribué.`,
    [org, "GADS-2026-07 — Agencement hôtel Paris", "OPP-401 — Hôtel Orsay", "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026"],
    { channel: "Google Ads", period, spend, clicks, leads, qualified_leads: qualified, attributed_pipeline: pipeline },
    `## Performance

- Dépense cumulée : ${Number(spend)} €.
- Clics : ${Number(clicks)}.
- Leads : ${Number(leads)}.
- Leads qualifiés : ${Number(qualified)}.
- Pipeline attribué : ${(Number(pipeline) / 1000).toLocaleString("fr-FR")} K€.
- Coût par lead qualifié : ${Number(qualified) ? Math.round(Number(spend) / Number(qualified)) : 0} €.

## Requête dominante

« agencement hôtel Paris » reste la requête la plus rentable et alimente l'opportunité Hôtel Orsay.`,
  );
}

add(
  "01_Raw/Marketing/Ads",
  "ACQ-SNAPSHOT-20260716",
  "marketing",
  "Acquisition multicanale du 16 juillet",
  "Google Search concentre 66 K€ de pipeline, Instagram 20 K€, le SEO 14 leads qualifiés et Meta ne produit toujours aucun lead qualifié.",
  [org, "GADS-DAILY-20260716 — Google Ads quotidien du 16-07-2026", "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026", "IG-492 — Timelapse chantier Rivoli", "META-2026-07 — Retargeting portfolio"],
  { period: "2026-07-16", total_paid_spend: 1043, attributed_pipeline: 86000, qualified_leads: 19 },
  `## Comparaison des canaux

- Google Ads : 731 € dépensés, 5 leads qualifiés, 66 K€ de pipeline.
- SEO : 14 leads qualifiés sur le mois, coût média nul.
- Instagram : 20 K€ de pipeline attribué au timelapse Rivoli.
- Meta Ads : 312 € dépensés, 3 leads, aucun qualifié.

## Décision proposée

Maintenir Google Search, accélérer l'étude de cas SEO Rivoli et suspendre la créa Meta actuelle. Toute modification de budget reste soumise à validation.`,
);

add(
  "01_Raw/Conversations/Emails",
  "MAIL-DIGEST-20260715",
  "document",
  "Emails reçus le 15 juillet 2026",
  "Onze emails entrants ont été reçus le 15 juillet : quatre demandent une action, trois sont prioritaires et deux modifient un risque ou une opportunité.",
  [org, "EMAIL-901 — Sophie Leclerc — Facture de juin", "EMAIL-902 — Pierre Lenoir — Duplicata Nova", "EMAIL-903 — Modification client Rivoli", "EMAIL-905 — Maison Cobalt — échéance", "EMAIL-908 — Hôtel Orsay — plans techniques", "EMAIL-910 — Architecte Lenoir — recommandation"],
  { period: "2026-07-15", inbound: 11, action_required: 4, priority: 3, positive: 3, questions: 2, later: 4, opposition: 0 },
  `## Récapitulatif

- 11 messages entrants.
- 4 messages demandent une action.
- 3 messages prioritaires.
- 3 réponses positives.
- 2 questions.
- 4 sujets à reprendre plus tard.
- 0 opposition explicite.

## Messages qui changent une décision

- EMAIL-903 : Rivoli valide le changement de finition sous réserve de chiffrage ; l'avenant devient prioritaire.
- EMAIL-908 : Hôtel Orsay confirme son comité jeudi à 14 h ; le chiffrage final doit être prêt avant.
- EMAIL-905 : Maison Cobalt demande d'attendre lundi ; aucune relance avant cette date.
- EMAIL-902 : Nova demande un duplicata de facture.`,
);

[
  ["EMAIL-912", "Claire Dumont — Demande étude de cas", "Studio Cime demande si une étude de cas Rivoli peut être partagée avant la réunion de vendredi.", "2026-07-15T14:18:00+02:00", "priority", ["OPP-403 — Studio Cime", "CONTENT-088 — Étude de cas Rivoli"]],
  ["EMAIL-913", "Google Ads — alerte budget", "La campagne Agencement hôtel Paris atteindra son budget mensuel trois jours avant la fin de période.", "2026-07-15T16:42:00+02:00", "question", ["GADS-DAILY-20260715 — Google Ads quotidien du 15-07-2026", "ACQ-SNAPSHOT-20260716 — Acquisition multicanale du 16 juillet"]],
  ["EMAIL-914", "Agence Web — correctifs SEO", "L'agence confirme que les redirections et canonical peuvent être corrigées avant vendredi.", "2026-07-15T17:06:00+02:00", "positive", ["SEO-TECH-20260716 — Audit SEO technique du 16 juillet"]],
  ["EMAIL-915", "Julie Martin — Avis Google", "Une cliente accepte de publier un avis détaillé après validation des photos du chantier.", "2026-07-15T18:21:00+02:00", "positive", ["SEO-LOCAL-20260716 — SEO local et Google Business Profile du 16 juillet"]],
  ["EMAIL-916", "Fournisseur Bois & Matières — livraison", "Le fournisseur confirme la livraison des panneaux jeudi entre 8 h et 10 h, sans action requise.", "2026-07-15T18:46:00+02:00", "neutral", ["OPS-SNAPSHOT-20260716 — Opérations du 16 juillet 2026"]],
].forEach(([id, title, summary, receivedAt, classification, links]) => add(
  "04_Conversations/Emails",
  id,
  "document",
  title,
  summary,
  [org, "MAIL-DIGEST-20260715 — Emails reçus le 15 juillet 2026", ...links],
  {
    record_kind: "email",
    direction: "inbound",
    received_at: receivedAt,
    mailbox: "inbox",
    classification,
    status: "to_process",
    ...(seededEmailContacts[id] ?? {}),
  },
));

add(
  "01_Raw/Operations",
  "OPS-SNAPSHOT-20260716",
  "project",
  "Opérations du 16 juillet 2026",
  "La charge atelier atteint 86 %. Deux risques sont ouverts : le conflit Thomas/Rivoli/CNC et la dérive de quatre jours sur Rivoli.",
  [org, "PROJET-241 — Chantier Rivoli", "PROC-007 — Calibration CNC", "TASK-641 — Contrôle qualité Rivoli", "TASK-642 — Calibration CNC"],
  { period: "2026-07-16", workshop_load_percent: 86, available_capacity_days: 4, projects_at_risk: 2, sensitive_deadlines: 2 },
  `## Capacité

- Charge atelier : 86 %, soit +9 points sur une semaine.
- Capacité disponible équipe pose : 4 jours vendredi.
- 7 échéances cette semaine, dont 2 sensibles.

## Risques

- Thomas est affecté au contrôle qualité Rivoli et à la calibration CNC jeudi après-midi.
- Rivoli consomme quatre jours de plus que le planning de référence.

## Scénario de correction

Hugo reprend le contrôle qualité Rivoli avec PROC-003. Thomas conserve la calibration CNC, encore insuffisamment documentée.`,
);

add(
  "01_Raw/Conversations/Emails",
  "MAIL-DIGEST-20260716",
  "document",
  "Emails reçus le 16 juillet 2026",
  "Neuf emails entrants ont été reçus le 16 juillet : trois requièrent une action, deux sont prioritaires et quatre sont informatifs.",
  [org, "EMAIL-918 — Rivoli — accord de principe avenant", "EMAIL-919 — Hôtel Orsay — comité confirmé", "EMAIL-920 — Bois & Matières — placage disponible", "EMAIL-921 — Expert-comptable — TVA juin"],
  { period: "2026-07-16", inbound: 9, action_required: 3, priority: 2, positive: 4, questions: 1, later: 2, opposition: 0 },
  `## Récapitulatif

- 9 messages entrants.
- 3 actions à traiter.
- 2 messages prioritaires.
- 4 réponses positives.
- 1 question.
- 2 sujets à reprendre plus tard.
- 0 opposition.

## Décisions affectées

- EMAIL-918 : Rivoli donne son accord de principe sur l'avenant de 6,8 K€ ; le PDF final doit partir après validation VAL-063.
- EMAIL-919 : Hôtel Orsay confirme le comité à 14 h et attend le chiffrage avant midi.
- EMAIL-920 : le placage chêne est disponible, mais le prix reste supérieur de 11,4 % au tarif cadre.
- EMAIL-921 : la TVA de juin, 8 740 €, doit être réglée le 20 juillet.`,
);

[
  ["EMAIL-918", "Rivoli — accord de principe avenant", "Le client accepte le principe de l'avenant de 6,8 K€ sous réserve du document final signé.", "2026-07-16T08:12:00+02:00", "positive", ["PROJET-241 — Chantier Rivoli", "VAL-063 — Valider l’avenant Rivoli"]],
  ["EMAIL-919", "Hôtel Orsay — comité confirmé", "Le comité est confirmé à 14 h. Le chiffrage final et les délais doivent être transmis avant midi.", "2026-07-16T08:37:00+02:00", "priority", ["OPP-401 — Hôtel Orsay", "DEV-317 — Devis Hôtel Orsay v3"]],
  ["EMAIL-920", "Bois & Matières — placage disponible", "Le placage chêne est disponible pour livraison vendredi, avec un prix supérieur de 11,4 % au tarif cadre.", "2026-07-16T09:04:00+02:00", "question", ["SUP-001 — Bois & Matières", "ACHAT-109 — Placage chêne"]],
  ["EMAIL-921", "Expert-comptable — TVA juin", "La TVA de juin représente 8 740 € et doit être réglée le 20 juillet.", "2026-07-16T09:42:00+02:00", "priority", ["FIN-TREASURY-20260716 — Prévision de trésorerie à 13 semaines"]],
].forEach(([id, title, summary, receivedAt, classification, links]) => add(
  "04_Conversations/Emails",
  id,
  "document",
  title,
  summary,
  [org, "MAIL-DIGEST-20260716 — Emails reçus le 16 juillet 2026", ...links],
  {
    record_kind: "email",
    direction: "inbound",
    received_at: receivedAt,
    mailbox: "inbox",
    classification,
    status: "to_process",
    ...(seededEmailContacts[id] ?? {}),
  },
));

add(
  "01_Raw/People",
  "HR-SNAPSHOT-20260716",
  "people",
  "Équipe et capacité du 16 juillet 2026",
  "L'entreprise compte 18 personnes. La capacité productive est de 149 heures sur la semaine, avec 17 heures d'absence et un poste de chef de projet à recruter.",
  [org, "PER-001 — Marie Delmas", "PER-003 — Thomas Renaud", "OPS-SNAPSHOT-20260716 — Opérations du 16 juillet 2026", "HR-RECRUIT-20260716 — Recrutement chef de projet"],
  { period: "2026-07-16", headcount: 18, productive_hours: 149, absence_hours: 17, overtime_hours: 9, open_positions: 1 },
  `## Effectif

- 18 personnes : 11 atelier et pose, 3 conduite de travaux, 2 commerce, 1 finance et 1 direction.
- Capacité productive planifiée : 149 heures.
- Absences : 17 heures, dont une journée d'absence prévue en pose.
- Heures supplémentaires prévues : 9 heures, concentrées sur Rivoli.

## Risques humains

- Thomas reste le seul référent autonome sur les réglages CNC complexes.
- Hugo peut reprendre le contrôle qualité standard grâce à PROC-003.
- Le recrutement d'un chef de projet est ouvert pour réduire la charge de coordination de Marie.`,
);

add(
  "05_People/Recrutement",
  "HR-RECRUIT-20260716",
  "people",
  "Recrutement chef de projet",
  "Le recrutement d'un chef de projet agencement est ouvert depuis douze jours : 27 candidatures, 6 qualifiées et 2 entretiens finaux.",
  [org, "HR-SNAPSHOT-20260716 — Équipe et capacité du 16 juillet 2026", "PER-001 — Marie Delmas"],
  { period: "2026-07-16", role: "Chef de projet agencement", days_open: 12, applications: 27, qualified: 6, final_interviews: 2, target_salary: 47000 },
  `## État du recrutement

- 27 candidatures reçues.
- 6 profils qualifiés.
- 2 entretiens finaux prévus le 17 juillet.
- Budget cible : 47 K€ brut annuel.
- Date d'arrivée souhaitée : 1er septembre.

## Critères critiques

Lecture de plans, pilotage de sous-traitants, maîtrise de la marge chantier et capacité à documenter les décisions dans OPS.`,
);

add(
  "05_People/Formation",
  "HR-TRAINING-20260716",
  "people",
  "Plan de transmission CNC et contrôle qualité",
  "Le plan de transmission couvre quatre sessions. Deux sont terminées ; la documentation CNC reste le principal point de dépendance.",
  [org, "PER-003 — Thomas Renaud", "PER-005 — Hugo Bernard", "PROC-003 — Contrôle qualité atelier", "PROC-007 — Calibration CNC"],
  { period: "2026-07-16", sessions_planned: 4, sessions_completed: 2, completion_percent: 50, critical_skill: "Calibration CNC" },
  `## Progression

- Contrôle qualité standard : transmis à Hugo, mise en situation validée.
- Réglages de finition : transfert enregistré, procédure à compléter.
- Calibration CNC : une session sur deux réalisée.
- Diagnostic de panne : non démarré.

## Prochaine étape

Thomas et Hugo terminent la calibration le 21 juillet. Le compte rendu doit enrichir PROC-007 et EXP-THOMAS-01.`,
);

add(
  "01_Raw/Procurement",
  "PROCUREMENT-SNAPSHOT-20260716",
  "procurement",
  "Achats et approvisionnements du 16 juillet",
  "Les commandes ouvertes représentent 31,6 K€. Deux livraisons sont sensibles et le placage chêne concentre 62 % de l'écart achat du mois.",
  [org, "ACHAT-109 — Placage chêne", "SUP-001 — Bois & Matières", "SUP-002 — Quincaillerie Europe", "STOCK-SNAPSHOT-20260716 — Stock critique du 16 juillet"],
  { period: "2026-07-16", open_purchase_orders: 31600, sensitive_deliveries: 2, month_purchase_variance: 2320, main_variance_share_percent: 62 },
  `## Situation

- Commandes fournisseurs ouvertes : 31 600 €.
- Écart achat cumulé du mois : +2 320 €.
- Placage chêne : +1 438 €, soit 62 % de l'écart.
- Deux livraisons sensibles : placage Rivoli vendredi et quincaillerie Nova lundi.

## Décision proposée

Confirmer le placage pour protéger le planning Rivoli, puis négocier un avoir ou un prix cadre sur la prochaine commande. Aucun engagement fournisseur sans validation.`,
);

add(
  "06_Operations/Stock",
  "STOCK-SNAPSHOT-20260716",
  "procurement",
  "Stock critique du 16 juillet",
  "Trois références sont sous leur seuil : charnières invisibles, vernis mat et panneaux bouleau 18 mm.",
  [org, "PROCUREMENT-SNAPSHOT-20260716 — Achats et approvisionnements du 16 juillet", "PROJET-246 — Finitions Nova"],
  { period: "2026-07-16", references: 284, below_reorder_point: 3, inventory_value: 48600, reserved_value: 21900 },
  `## Inventaire

- 284 références actives.
- Valeur de stock : 48 600 €.
- Valeur réservée aux chantiers : 21 900 €.
- 3 références sous seuil.

## Références sous seuil

- Charnières invisibles 110° : 42 unités, seuil 60 ; Nova nécessite 36 unités.
- Vernis mat incolore : 11 litres, seuil 18 ; besoin Rivoli 8 litres.
- Panneaux bouleau 18 mm : 7 unités, seuil 12 ; aucun blocage immédiat.`,
);

[
  ["SUP-001", "Bois & Matières", "A", 184000, 96, "Fournisseur principal de panneaux et placages. Qualité stable, prix placage à renégocier.", ["ACHAT-109 — Placage chêne", "EMAIL-920 — Bois & Matières — placage disponible"]],
  ["SUP-002", "Quincaillerie Europe", "B", 76000, 88, "Livraisons généralement fiables ; retard de deux jours sur la commande Nova.", ["PROJET-246 — Finitions Nova", "STOCK-SNAPSHOT-20260716 — Stock critique du 16 juillet"]],
  ["SUP-003", "Finitions Île-de-France", "A", 52000, 98, "Fournisseur vernis et teintes, aucun incident qualité sur douze mois.", ["STOCK-SNAPSHOT-20260716 — Stock critique du 16 juillet"]],
].forEach(([id, title, rating, annualSpend, onTime, summary, links]) => add(
  "06_Operations/Fournisseurs",
  id,
  "entity",
  title,
  summary,
  [org, "PROCUREMENT-SNAPSHOT-20260716 — Achats et approvisionnements du 16 juillet", ...links],
  { record_kind: "supplier", rating, annual_spend: annualSpend, on_time_delivery_percent: onTime, status: "active" },
));

add(
  "01_Raw/Finance",
  "FIN-TREASURY-20260716",
  "finance",
  "Prévision de trésorerie à 13 semaines",
  "Le scénario central conserve plus de 60 jours de visibilité. Le point bas est prévu à 39,8 K€ le 5 août avant encaissement Rivoli.",
  [org, "FIN-SNAPSHOT-20260716 — Finance du 16 juillet 2026", "FACT-879 — Atelier Sud — 12400 EUR", "FACT-886 — Nova Hôtels — 7800 EUR", "EMAIL-921 — Expert-comptable — TVA juin"],
  { period: "2026-07-16", horizon_weeks: 13, current_cash: 68400, lowest_cash: 39800, lowest_cash_date: "2026-08-05", tax_due: 8740 },
  `## Prévision centrale

- Solde bancaire actuel : 68 400 €.
- Point bas : 39 800 € le 5 août.
- TVA juin : 8 740 € à payer le 20 juillet.
- Encaissements attendus sous sept jours : 20 200 € après les relances validées.
- Acompte Rivoli attendu : 28 000 € le 7 août.

## Sensibilité

Sans encaissement Atelier Sud et Nova, le point bas descend à 19 600 € et la visibilité passe sous 45 jours.`,
);

add(
  "07_Finance/Rentabilite",
  "FIN-PNL-2026-06",
  "finance",
  "Compte de résultat juin 2026",
  "Juin clôture à 168,4 K€ de chiffre d'affaires, 50,9 K€ de marge brute et 14,8 K€ de résultat opérationnel.",
  [org, "FIN-SNAPSHOT-20260716 — Finance du 16 juillet 2026", "STRAT-2026-Q3 — Stratégie commerciale T3"],
  { period: "2026-06", revenue: 168400, gross_margin: 50900, gross_margin_percent: 30.2, payroll: 62400, operating_profit: 14800 },
  `## Juin 2026

- Chiffre d'affaires : 168 400 €.
- Marge brute : 50 900 €, soit 30,2 %.
- Masse salariale chargée : 62 400 €.
- Frais fixes hors masse salariale : 21 700 €.
- Résultat opérationnel : 14 800 €.

## Écart budget

Le chiffre d'affaires est supérieur de 6,2 %, mais la marge brute est inférieure de 1,4 point à cause des achats et heures non refacturées.`,
);

add(
  "01_Raw/Customer",
  "CX-SNAPSHOT-20260716",
  "customer",
  "Satisfaction et qualité client du 16 juillet",
  "Le NPS sur 90 jours est de 61. Deux irritants récurrents concernent les délais de chiffrage et le manque de visibilité entre deux jalons.",
  [org, "CLI-001 — Rivoli Développement", "CLI-003 — Nova Hôtels", "SEO-LOCAL-20260716 — SEO local et Google Business Profile du 16 juillet"],
  { period: "2026-07-16", nps_90d: 61, respondents: 23, promoters: 16, passives: 5, detractors: 2, open_incidents: 2 },
  `## Mesure sur 90 jours

- NPS : 61 sur 23 réponses.
- 16 promoteurs, 5 passifs et 2 détracteurs.
- Note Google : 4,8/5 sur 67 avis.

## Irritants

- Délai moyen de chiffrage : 6,4 jours contre une cible de 5 jours.
- Deux clients demandent davantage de visibilité entre validation des plans et lancement atelier.

## Opportunité

Automatiser un point d'avancement hebdomadaire validé par le chef de projet avant envoi.`,
);

add(
  "01_Raw/Marketing/Web",
  "WEB-SNAPSHOT-20260716",
  "marketing",
  "Site web et conversion du 16 juillet",
  "Le site a généré 2 846 sessions sur 28 jours, 47 demandes et un taux de conversion de 1,65 %. La page Hôtel convertit à 3,8 %.",
  [org, "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026", "GADS-DAILY-20260716 — Google Ads quotidien du 16-07-2026", "OPP-401 — Hôtel Orsay"],
  { period: "2026-07-16", window: "28d", sessions: 2846, engaged_sessions: 1942, forms: 31, phone_clicks: 16, leads: 47, conversion_rate_percent: 1.65 },
  `## Acquisition du site — 28 jours

- 2 846 sessions.
- 1 942 sessions engagées.
- 31 formulaires envoyés.
- 16 clics téléphone.
- 47 leads au total.
- Taux de conversion : 1,65 %.

## Pages

- /agencement-hotel-paris : 3,8 % de conversion.
- /menuiserie-sur-mesure-paris : 1,9 %.
- Accueil : 0,8 %, principal gisement d'amélioration.

## Friction

Sur mobile, 38 % des abandons de formulaire interviennent au champ « budget ». Tester un choix par fourchettes plutôt qu'un champ libre.`,
);

add(
  "01_Raw/Marketing/Social",
  "LINKEDIN-SNAPSHOT-20260716",
  "marketing",
  "LinkedIn dirigeante du 16 juillet",
  "Les publications de Marie ont généré 28 600 impressions, 412 interactions et 19 conversations qualifiées sur 30 jours.",
  [org, "PER-001 — Marie Delmas", "CONTENT-088 — Étude de cas Rivoli", "OPP-402 — Maison Lenoir"],
  { period: "2026-07-16", window: "30d", posts: 9, impressions: 28600, interactions: 412, profile_views: 936, qualified_conversations: 19, attributed_pipeline: 34000 },
  `## Performance sur 30 jours

- 9 publications.
- 28 600 impressions.
- 412 interactions.
- 936 visites de profil.
- 19 conversations qualifiées.
- 34 K€ de pipeline assisté via Maison Lenoir.

## Formats

Le retour d'expérience chantier obtient 2,4 fois plus de sauvegardes que les publications génériques. Le prochain entretien vocal doit porter sur les compromis de finition Rivoli.`,
);

add(
  "01_Raw/Legal",
  "LEGAL-SNAPSHOT-20260716",
  "legal",
  "Juridique, assurances et conformité du 16 juillet",
  "Aucun contentieux n'est ouvert. Deux échéances approchent : renouvellement RC Pro le 31 août et revue du contrat cadre Bois & Matières le 15 septembre.",
  [org, "CONTRAT-241 — Rivoli signé", "SUP-001 — Bois & Matières", "RGPD-REGISTER-20260716 — Registre RGPD et accès"],
  { period: "2026-07-16", open_disputes: 0, contracts_to_review_60d: 2, insurance_renewal: "2026-08-31", supplier_contract_review: "2026-09-15" },
  `## État

- Aucun contentieux ou litige actif.
- RC Pro : renouvellement le 31 août, attestation à demander avant le 5 août.
- Contrat cadre Bois & Matières : revue tarifaire le 15 septembre.
- Contrats salariés et sous-traitants : aucun document expiré.

## Vigilance

Les modèles d'avenant chantier doivent préciser plus clairement l'impact planning des modifications client.`,
);

add(
  "10_Connaissance/Conformite",
  "RGPD-REGISTER-20260716",
  "legal",
  "Registre RGPD et accès",
  "Le registre couvre CRM, prospection, facturation, recrutement et vidéosurveillance. Une revue d'accès est due le 31 juillet.",
  [org, "LEGAL-SNAPSHOT-20260716 — Juridique, assurances et conformité du 16 juillet", "RULE-001 — Aucune action externe sans validation"],
  { period: "2026-07-16", processing_activities: 5, open_requests: 0, access_review_due: "2026-07-31", incidents_12m: 0 },
  `## Traitements suivis

- CRM et relation client.
- Prospection B2B.
- Facturation et recouvrement.
- Recrutement.
- Vidéosurveillance de l'atelier.

## Contrôles

- 0 demande de droit ouverte.
- 0 incident déclaré sur douze mois.
- Revue des accès prévue le 31 juillet.
- Les exports de données restent soumis à validation de direction.`,
);

add(
  "06_Operations/Actifs",
  "ASSET-SNAPSHOT-20260716",
  "asset",
  "Machines, véhicules et maintenance du 16 juillet",
  "Vingt-sept actifs sont suivis. La CNC est disponible à 94,2 % et le véhicule pose 2 doit passer en révision avant le 30 juillet.",
  [org, "PROC-007 — Calibration CNC", "TASK-642 — Calibration CNC", "OPS-SNAPSHOT-20260716 — Opérations du 16 juillet 2026"],
  { period: "2026-07-16", tracked_assets: 27, cnc_availability_percent: 94.2, open_maintenance: 3, urgent_maintenance: 1 },
  `## Actifs

- 9 machines atelier.
- 4 véhicules.
- 14 équipements de pose et de mesure.
- 3 opérations de maintenance ouvertes.

## Priorités

- CNC : calibration jeudi, disponibilité 94,2 % sur 30 jours.
- Véhicule pose 2 : révision avant le 30 juillet, 2 000 km restants.
- Plaqueuse de chants : aspiration à contrôler avant la prochaine série Rivoli.`,
);

add(
  "11_Wiki",
  "WIKI-PEOPLE-20260716",
  "decision",
  "Synthèse équipe et transmission au 16 juillet",
  "La capacité est maîtrisée à court terme, mais la dépendance CNC et le recrutement chef de projet doivent rester suivis.",
  [org, "HR-SNAPSHOT-20260716 — Équipe et capacité du 16 juillet 2026", "HR-RECRUIT-20260716 — Recrutement chef de projet", "HR-TRAINING-20260716 — Plan de transmission CNC et contrôle qualité"],
  { period: "2026-07-16", status: "maintained", source_count: 3 },
  `## Diagnostic

L'effectif compte 18 personnes. La semaine dispose de 149 heures productives, mais la calibration CNC reste dépendante de Thomas. Deux candidats chef de projet sont en entretien final.

## Priorités

- Finir la transmission CNC avec Hugo.
- Choisir le candidat chef de projet après les entretiens du 17 juillet.
- Contrôler les 9 heures supplémentaires Rivoli pour éviter un nouvel écart de marge.`,
);

add(
  "11_Wiki",
  "WIKI-SUPPLY-20260716",
  "decision",
  "Synthèse achats, stock et fournisseurs au 16 juillet",
  "Le planning est sécurisable, mais trois références sont sous seuil et le placage chêne concentre 62 % de l'écart achat.",
  [org, "PROCUREMENT-SNAPSHOT-20260716 — Achats et approvisionnements du 16 juillet", "STOCK-SNAPSHOT-20260716 — Stock critique du 16 juillet", "SUP-001 — Bois & Matières", "SUP-002 — Quincaillerie Europe"],
  { period: "2026-07-16", status: "maintained", source_count: 4 },
  `## Diagnostic

Les commandes ouvertes atteignent 31,6 K€ et l'écart achat mensuel 2 320 €. Le placage Rivoli doit être confirmé pour éviter un blocage vendredi.

## Priorités

- Confirmer le placage après validation.
- Sécuriser les charnières Nova.
- Renégocier le prix cadre Bois & Matières avant la prochaine commande.`,
);

add(
  "11_Wiki",
  "WIKI-RISK-20260716",
  "decision",
  "Synthèse risques et conformité au 16 juillet",
  "Aucun contentieux ni incident RGPD n'est ouvert. Les principales échéances sont la RC Pro, la revue des accès et le contrat fournisseur.",
  [org, "LEGAL-SNAPSHOT-20260716 — Juridique, assurances et conformité du 16 juillet", "RGPD-REGISTER-20260716 — Registre RGPD et accès", "ASSET-SNAPSHOT-20260716 — Machines, véhicules et maintenance du 16 juillet"],
  { period: "2026-07-16", status: "maintained", source_count: 3 },
  `## Risques ouverts

- Renouvellement RC Pro au 31 août.
- Revue des accès OPS au 31 juillet.
- Révision du véhicule pose 2 avant le 30 juillet.
- Mise à jour du modèle d'avenant chantier.

## Situation

Aucun contentieux, aucune demande RGPD et aucun incident de données ne sont ouverts.`,
);

add(
  "11_Wiki",
  "WIKI-SEO-20260716",
  "decision",
  "Synthèse SEO maintenue au 16 juillet",
  "Le SEO progresse en trafic et en visibilité, mais le gain court terme dépend de trois actions : étude de cas Rivoli, correctifs techniques et renforcement local/GEO.",
  [org, "SEO-SNAPSHOT-20260714 — SEO quotidien du 14-07-2026", "SEO-SNAPSHOT-20260715 — SEO quotidien du 15-07-2026", "SEO-SNAPSHOT-20260716 — SEO quotidien du 16-07-2026", "SEO-TECH-20260716 — Audit SEO technique du 16 juillet", "SEO-CONTENT-20260716 — Analyse de contenu SEO du 16 juillet", "SEO-LOCAL-20260716 — SEO local et Google Business Profile du 16 juillet", "SEO-COMP-20260716 — Concurrence SEO du 16 juillet", "GEO-SNAPSHOT-20260716 — Visibilité dans les moteurs IA du 16 juillet"],
  { period: "2026-07-16", status: "maintained", source_count: 8 },
  `## Diagnostic

Les clics organiques sur 28 jours passent de 412 à 447 entre le 14 et le 16 juillet, soit +8,5 %. La position moyenne du site s'améliore de 14,2 à 13,4. La requête prioritaire « agencement hôtel Paris » progresse de la position 8,4 à 7,1 et atteint 96 clics.

## Trois priorités

- Publier l'étude de cas Rivoli et créer huit liens internes.
- Corriger trois erreurs 404, deux canonical et l'image LCP de la page Hôtel.
- Renforcer Google Business Profile et la page de référence GEO.

## Indicateurs de pilotage

- Requête Hôtel dans le top 5.
- LCP mobile inférieur à 2,5 s.
- 520 clics organiques sur 28 jours.
- 7 citations sur 12 requêtes moteurs IA.`,
);

add(
  "11_Wiki",
  "WIKI-DIRECTION-20260716",
  "decision",
  "Synthèse dirigeant du 16 juillet",
  "Le chiffre d'affaires et le pipeline progressent ; la marge Rivoli, les créances, l'exécution SEO, la dépendance CNC et les approvisionnements sensibles restent les priorités.",
  [org, "FIN-SNAPSHOT-20260716 — Finance du 16 juillet 2026", "CRM-SNAPSHOT-20260716 — Pipeline du 16 juillet 2026", "OPS-SNAPSHOT-20260716 — Opérations du 16 juillet 2026", "WIKI-SEO-20260716 — Synthèse SEO maintenue au 16 juillet", "MAIL-DIGEST-20260716 — Emails reçus le 16 juillet 2026", "WIKI-PEOPLE-20260716 — Synthèse équipe et transmission au 16 juillet", "WIKI-SUPPLY-20260716 — Synthèse achats, stock et fournisseurs au 16 juillet", "WIKI-RISK-20260716 — Synthèse risques et conformité au 16 juillet"],
  { period: "2026-07-16", status: "maintained", source_count: 8 },
  `## Situation

Le CA mensuel atteint 43,6 K€ et le pipeline 184 K€. La marge descend à 28,9 %. Les créances échues représentent 24,3 K€, dont 20,2 K€ à relancer immédiatement.

## Priorités de direction

- Sécuriser l'avenant Rivoli et le nouveau partage de charge.
- Exécuter les deux relances validées.
- Lancer le plan SEO Rivoli et les correctifs techniques.
- Confirmer le placage et les charnières qui protègent le planning.
- Finir la transmission CNC et arbitrer le recrutement chef de projet.

## Point de contrôle

Revue quotidienne à 17 h sur encaissements, marge Rivoli, préparation Hôtel Orsay et avancement SEO.`,
);

add(
  "00_System",
  "INDEX",
  "knowledge",
  "Index de la mémoire OPS",
  "Index d'entrée de la mémoire vivante. Il oriente OPS vers les synthèses maintenues avant de consulter les sources brutes.",
  [org, "WIKI-DIRECTION-20260716 — Synthèse dirigeant du 16 juillet", "WIKI-SEO-20260716 — Synthèse SEO maintenue au 16 juillet", "WIKI-PEOPLE-20260716 — Synthèse équipe et transmission au 16 juillet", "WIKI-SUPPLY-20260716 — Synthèse achats, stock et fournisseurs au 16 juillet", "WIKI-RISK-20260716 — Synthèse risques et conformité au 16 juillet", "CRM-SNAPSHOT-20260716 — Pipeline du 16 juillet 2026", "FIN-SNAPSHOT-20260716 — Finance du 16 juillet 2026", "MAIL-DIGEST-20260716 — Emails reçus le 16 juillet 2026", "OPS-SNAPSHOT-20260716 — Opérations du 16 juillet 2026", "CX-SNAPSHOT-20260716 — Satisfaction et qualité client du 16 juillet", "WEB-SNAPSHOT-20260716 — Site web et conversion du 16 juillet"],
  { status: "maintained", schema_version: 2 },
  `## Points d'entrée

- Direction : [[WIKI-DIRECTION-20260716 — Synthèse dirigeant du 16 juillet]].
- SEO : [[WIKI-SEO-20260716 — Synthèse SEO maintenue au 16 juillet]].
- Équipe : [[WIKI-PEOPLE-20260716 — Synthèse équipe et transmission au 16 juillet]].
- Achats et stock : [[WIKI-SUPPLY-20260716 — Synthèse achats, stock et fournisseurs au 16 juillet]].
- Risques et conformité : [[WIKI-RISK-20260716 — Synthèse risques et conformité au 16 juillet]].
- Commercial : [[CRM-SNAPSHOT-20260716 — Pipeline du 16 juillet 2026]].
- Finance : [[FIN-SNAPSHOT-20260716 — Finance du 16 juillet 2026]].
- Emails : [[MAIL-DIGEST-20260716 — Emails reçus le 16 juillet 2026]].
- Opérations : [[OPS-SNAPSHOT-20260716 — Opérations du 16 juillet 2026]].
- Satisfaction client : [[CX-SNAPSHOT-20260716 — Satisfaction et qualité client du 16 juillet]].
- Site et conversion : [[WEB-SNAPSHOT-20260716 — Site web et conversion du 16 juillet]].

## Convention

Les dossiers 01_Raw contiennent les sources datées. Le dossier 11_Wiki contient les synthèses cumulatives. Toute écriture issue de l'application est journalisée dans LOG.`,
);

add(
  "00_System",
  "LOG",
  "knowledge",
  "Journal de la mémoire OPS",
  "Journal chronologique append-only des ingestions, synthèses et actions contrôlées.",
  [org, "INDEX — Index de la mémoire OPS"],
  { status: "append_only", schema_version: 2 },
  `## [2026-07-16 08:00] ingest | Snapshots quotidiens

Ajout des snapshots Finance, CRM, SEO, Ads, emails et opérations.

## [2026-07-16 08:04] compile | Wiki direction

Mise à jour de la synthèse dirigeant à partir de cinq familles de sources.

## [2026-07-16 08:07] compile | Wiki SEO

Mise à jour du diagnostic SEO, local, technique, contenu, concurrence et GEO.

## [2026-07-16 08:10] lint | Relations

Aucun nœud critique orphelin. Les rapports quotidiens sont reliés aux synthèses maintenues.`,
);

const fileStemById = new Map(records.map((record) => [
  record.id,
  safeFileName(`${record.id} — ${record.title}`),
]));

for (const record of records) {
  const directory = path.join(root, record.folder);
  await fs.mkdir(directory, { recursive: true });
  const fileStem = fileStemById.get(record.id);
  if (!fileStem) throw new Error(`Missing file stem for ${record.id}`);
  const fileName = `${fileStem}.md`;
  const filePath = path.join(directory, fileName);
  const normalizedLinks = [...new Set(record.links.map((link) => {
    const clean = link.replace(/\[\[|\]\]/g, "");
    const id = clean.split(" — ")[0];
    return fileStemById.get(id) ?? safeFileName(clean);
  }))].filter((link) => link !== fileStem);
  const extras = Object.entries(record.extra)
    .map(([key, value]) => `${key}: ${frontmatterValue(value)}`)
    .join("\n");
  const recordDate = typeof record.extra.period === "string"
    ? `${record.extra.period}T08:00:00+02:00`
    : "2026-07-15T08:00:00+02:00";
  const preserved = await preservedOperationalContent(filePath, record.id);
  const markdown = `---\nid: ${record.id}\ntype: ${record.type}\ntitle: ${JSON.stringify(record.title)}\nmanaged_by: ops-memory\norganization: "[[${org}]]"\ncreated_at: ${recordDate}\nupdated_at: ${recordDate}\nconfidence: 1.0\nsource: OPS Memory\n${extras}\n---\n\n# ${record.title}\n\n${record.summary}\n\n${record.body ? `${record.body.trim()}\n\n` : ""}## Relations\n\n${normalizedLinks.map((link) => `- [[${link}]]`).join("\n") || `- [[${org}]]`}\n\n## Provenance\n\nConnaissance structurée par OPS à partir des sources citées. Toute action externe reste soumise aux autorisations actives.${preserved ? `\n\n${preserved}` : ""}\n`;
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, markdown, "utf8");
  await fs.rename(temporaryPath, filePath);
}

console.log(`OPS memory seeded: ${records.length} notes in ${root}`);
