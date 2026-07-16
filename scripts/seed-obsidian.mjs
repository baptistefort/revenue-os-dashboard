import { promises as fs } from "node:fs";
import path from "node:path";

const vault = process.env.OBSIDIAN_VAULT_PATH;
if (!vault) throw new Error("OBSIDIAN_VAULT_PATH is required");

const root = path.join(vault, "OPS Demo — Atelier Beaumarchais");
const org = "ORG-001 — Atelier Beaumarchais";

const records = [];
const add = (folder, id, type, title, summary, links = [], extra = {}) => records.push({ folder, id, type, title, summary, links, extra });

add("00_System", "ORG-001", "company", "Atelier Beaumarchais", "Menuiserie et agencement sur mesure à Paris 11. Dix-huit personnes, une mémoire OPS et un système de validation humaine.", [], { status: "active", employees: 18, city: "Paris 11" });
add("00_System", "MANIFEST", "knowledge", "Manifest de la démo OPS", "Ce coffre contient uniquement des données fictives destinées à la démonstration visuelle d’OPS.", [org], { demo: true, resettable: true });

[
  ["PER-001", "Marie Delmas", "Direction", "Arbitre la stratégie, les budgets et les actions externes sensibles."],
  ["PER-002", "Camille Laurent", "Responsable commerciale", "A signé quatre affaires ce mois et pilote les comptes stratégiques."],
  ["PER-003", "Thomas Renaud", "Chef d’atelier", "Douze ans d’ancienneté. Détient le savoir critique sur la CNC et les finitions."],
  ["PER-004", "Inès Martin", "Administration et finance", "Suit les factures, les paiements, la marge et la trésorerie."],
  ["PER-005", "Hugo Bernard", "Conducteur de travaux", "Suit Rivoli et peut reprendre une partie du contrôle qualité."],
].forEach(([id, title, role, summary]) => add("02_Direction/Equipe", id, "person", title, summary, [org], { role }));

const clientRows = [
  ["CLI-001", "Rivoli Développement", "active", 120000, "[[PROJET-241 — Chantier Rivoli]]", "Client stratégique, chantier à 62 % et avenant à valider."],
  ["CLI-002", "Atelier Sud", "active_at_risk", 94000, "[[FACT-879 — Atelier Sud — 12400 EUR]]", "Client historique avec une facture en retard de 28 jours."],
  ["CLI-003", "Nova Hôtels", "active", 88000, "[[OPP-404 — Extension Nova Hôtels]]", "Client actif avec une extension de 72 K€ en négociation."],
  ["CLI-004", "Maison Cobalt", "watch", 41000, "[[FACT-890 — Maison Cobalt — 4100 EUR]]", "Relation sensible. Le dernier email demande d’attendre lundi."],
  ["CLI-005", "Groupe Lumen", "dormant", 86000, "[[DEC-071 — Réactiver Groupe Lumen]]", "Aucune commande depuis 94 jours, aucun litige, potentiel fort."],
  ["CLI-006", "Studio Marais", "dormant", 62000, "[[DEC-072 — Réactiver Studio Marais]]", "Aucune commande depuis 76 jours, historique de projets récurrents."],
];
clientRows.forEach(([id, title, status, revenue, relation, summary]) => add("03_CRM/Clients", id, "client", title, summary, [org, String(relation).replace(/\[\[|\]\]/g, "")], { status, revenue_12m: revenue }));

[
  ["OPP-401", "Hôtel Orsay", 58000, "proposal", "Google Ads", "[[GADS-2026-07 — Agencement hôtel Paris]]"],
  ["OPP-402", "Maison Lenoir", 34000, "discovery", "Architecte", "[[STRAT-2026-Q3 — Stratégie commerciale T3]]"],
  ["OPP-403", "Studio Cime", 20000, "qualification", "Instagram", "[[IG-492 — Timelapse chantier Rivoli]]"],
  ["OPP-404", "Extension Nova Hôtels", 72000, "negotiation", "Client", "[[CLI-003 — Nova Hôtels]]"],
].forEach(([id, title, amount, stage, source, link]) => add("03_CRM/Opportunites", id, "project", title, `Opportunité de ${Number(amount).toLocaleString("fr-FR")} € au stade ${stage}, origine ${source}.`, [org, String(link).replace(/\[\[|\]\]/g, ""), "PER-002 — Camille Laurent"], { amount, stage, source }));

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
  ["EXP-THOMAS-01", "Réglages CNC et finitions", "Savoir documenté partiellement lors d’une démonstration atelier.", ["PER-003 — Thomas Renaud", "PROC-007 — Calibration CNC"]],
].forEach(([id, title, summary, links]) => add("08_Documents", id, id.startsWith("EXP") ? "knowledge" : "document", title, summary, [org, ...links]));

[
  ["EMAIL-901", "Sophie Leclerc — Facture de juin", "Atelier Sud indique que le règlement sera traité cette semaine.", ["CLI-002 — Atelier Sud", "FACT-879 — Atelier Sud — 12400 EUR"]],
  ["EMAIL-902", "Pierre Lenoir — Duplicata Nova", "Nova demande un duplicata et n’a pas obtenu de délai supplémentaire.", ["CLI-003 — Nova Hôtels", "FACT-886 — Nova Hôtels — 7800 EUR"]],
  ["EMAIL-903", "Modification client Rivoli", "Le client valide le changement de finition, sous réserve de chiffrage.", ["PROJET-241 — Chantier Rivoli", "DEC-063 — Avenant Rivoli 6800 EUR"]],
  ["EMAIL-905", "Maison Cobalt — échéance", "Le virement partira lundi prochain. Ne pas relancer avant cette date.", ["CLI-004 — Maison Cobalt", "FACT-890 — Maison Cobalt — 4100 EUR"]],
  ["EMAIL-908", "Hôtel Orsay — plans techniques", "Le comité d’investissement se réunit jeudi à 14 h.", ["OPP-401 — Hôtel Orsay", "DEV-317 — Devis Hôtel Orsay v3"]],
  ["EMAIL-910", "Architecte Lenoir — recommandation", "Introduction auprès de Maison Lenoir et contexte du besoin.", ["OPP-402 — Maison Lenoir", "PER-002 — Camille Laurent"]],
].forEach(([id, title, summary, links]) => add("04_Conversations/Emails", id, "document", title, summary, [org, ...links]));

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
  ["TASK-641", "Contrôle qualité Rivoli", "PER-005 — Hugo Bernard", "PROJET-241 — Chantier Rivoli"],
  ["TASK-642", "Calibration CNC", "PER-003 — Thomas Renaud", "PROC-007 — Calibration CNC"],
  ["TASK-643", "Chiffrage Hôtel Orsay", "PER-002 — Camille Laurent", "OPP-401 — Hôtel Orsay"],
  ["TASK-644", "Duplicata Nova", "PER-004 — Inès Martin", "FACT-886 — Nova Hôtels — 7800 EUR"],
  ["TASK-645", "Brouillon relance Atelier Sud", "PER-004 — Inès Martin", "FACT-879 — Atelier Sud — 12400 EUR"],
  ["TASK-646", "Étude de cas Rivoli", "PER-002 — Camille Laurent", "CONTENT-088 — Étude de cas Rivoli"],
].forEach(([id, title, owner, related]) => add("06_Operations/Taches", id, "project", title, `Tâche opérationnelle assignée à ${String(owner).replace(/^PER-\d+ — /, "")}.`, [org, String(owner), String(related)], { status: "open" }));

[
  ["CRM-SNAPSHOT-20260715", "Pipeline", "Pipeline ouvert : 184 K€ répartis sur quatre opportunités.", ["OPP-401 — Hôtel Orsay", "OPP-402 — Maison Lenoir", "OPP-403 — Studio Cime", "OPP-404 — Extension Nova Hôtels"]],
  ["FIN-SNAPSHOT-20260715", "Finance", "CA du mois 42,8 K€, marge 29 %, trésorerie 67 jours, créances 24,3 K€.", ["FACT-882 — Rivoli — 28000 EUR", "FACT-886 — Nova Hôtels — 7800 EUR", "FACT-890 — Maison Cobalt — 4100 EUR", "FACT-893 — Maintenance — 2900 EUR"]],
  ["SYNTH-2026-W29", "Synthèse hebdomadaire W29", "Rivoli, créances clients et acquisition Search sont les trois thèmes de la semaine.", ["ALERT-201 — Écart de marge Rivoli", "ALERT-202 — Créances en retard", "GADS-2026-07 — Agencement hôtel Paris"]],
  ["BRIEF-20260715", "Brief dirigeant du 15 juillet", "Trois décisions avant midi et quatre événements à surveiller.", ["DEC-058 — Renfort atelier Rivoli", "DEC-061 — Relances clients", "DEC-063 — Avenant Rivoli 6800 EUR"]],
].forEach(([id, title, summary, links]) => add("12_Syntheses", id, "decision", title, summary, [org, ...links]));

const nameById = new Map(records.map((record) => [record.id, `${record.id} — ${record.title}`]));

for (const record of records) {
  const directory = path.join(root, record.folder);
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${record.id} — ${record.title}.md`.replaceAll("/", "-");
  const normalizedLinks = [...new Set(record.links.map((link) => {
    const clean = link.replace(/\[\[|\]\]/g, "");
    const id = clean.split(" — ")[0];
    return nameById.get(id) ?? clean;
  }))].filter((link) => link !== `${record.id} — ${record.title}`);
  const extras = Object.entries(record.extra).map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : value}`).join("\n");
  const markdown = `---\nid: ${record.id}\ntype: ${record.type}\ntitle: ${JSON.stringify(record.title)}\ndemo: true\norganization: "[[${org}]]"\ncreated_at: 2026-07-15T08:00:00+02:00\nupdated_at: 2026-07-15T11:30:00+02:00\nconfidence: 1.0\nsource: OPS Demo Seed\n${extras}\n---\n\n# ${record.title}\n\n${record.summary}\n\n## Relations\n\n${normalizedLinks.map((link) => `- [[${link}]]`).join("\n") || `- [[${org}]]`}\n\n## Provenance\n\nDonnée fictive créée pour la démonstration OPS. Aucune action externe autorisée.\n`;
  await fs.writeFile(path.join(directory, fileName), markdown, "utf8");
}

console.log(`OPS Demo Vault seeded: ${records.length} notes in ${root}`);
