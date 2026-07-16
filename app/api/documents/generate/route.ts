import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { guardPostRequest } from "@/lib/api-guard";
import { getMemoryRecords, searchCompanyMemory, type OpsMemoryRecord } from "@/lib/ops-memory";

export const runtime = "nodejs";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const NAVY = rgb(0.035, 0.12, 0.25);
const INK = rgb(0.09, 0.12, 0.16);
const MUTED = rgb(0.39, 0.43, 0.48);
const LINE = rgb(0.88, 0.89, 0.91);
const SOFT = rgb(0.965, 0.97, 0.976);
const BLUE = rgb(0.20, 0.43, 0.68);

function printable(value: string) {
  return value
    .replaceAll("\u202f", " ")
    .replaceAll("\u00a0", " ")
    .replace(/[\u2022]/g, "-")
    .replace(/[^\u0000-\u00ff\u20ac\u2013\u2014\u2018\u2019\u201c\u201d]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = printable(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawParagraph(page: PDFPage, text: string, options: {
  x: number;
  y: number;
  width: number;
  font: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  lineHeight?: number;
}) {
  const size = options.size ?? 10.5;
  const lineHeight = options.lineHeight ?? size * 1.48;
  const lines = wrapText(text, options.font, size, options.width);
  lines.forEach((line, index) => page.drawText(line, {
    x: options.x,
    y: options.y - index * lineHeight,
    size,
    font: options.font,
    color: options.color ?? INK,
  }));
  return options.y - lines.length * lineHeight;
}

function drawHeader(page: PDFPage, regular: PDFFont, bold: PDFFont, section: string, pageNumber: number) {
  page.drawText("OPS°", { x: 42, y: PAGE_HEIGHT - 46, size: 14, font: bold, color: NAVY });
  page.drawText(section.toLocaleUpperCase("fr"), { x: 102, y: PAGE_HEIGHT - 44, size: 7, font: bold, color: MUTED });
  page.drawText(String(pageNumber).padStart(2, "0"), { x: PAGE_WIDTH - 55, y: PAGE_HEIGHT - 44, size: 8, font: regular, color: MUTED });
  page.drawLine({ start: { x: 42, y: PAGE_HEIGHT - 59 }, end: { x: PAGE_WIDTH - 42, y: PAGE_HEIGHT - 59 }, thickness: .7, color: LINE });
}

function drawMetric(page: PDFPage, regular: PDFFont, bold: PDFFont, x: number, y: number, label: string, value: string, detail: string) {
  page.drawRectangle({ x, y, width: 119, height: 86, color: SOFT, borderColor: LINE, borderWidth: .5 });
  page.drawText(printable(label), { x: x + 12, y: y + 63, size: 7.5, font: regular, color: MUTED });
  page.drawText(printable(value), { x: x + 12, y: y + 35, size: 19, font: bold, color: NAVY });
  page.drawText(printable(detail), { x: x + 12, y: y + 14, size: 6.5, font: regular, color: MUTED });
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
}

type ReportContext = {
  lead?: unknown;
  body?: unknown;
  sources?: unknown;
  userRequest?: unknown;
};

type ReportPayload = {
  title?: unknown;
  topic?: unknown;
  sourceIds?: unknown;
  context?: unknown;
};

function cleanText(value: unknown, fallback: string, maxLength = 220) {
  return printable(typeof value === "string" ? value.trim().slice(0, maxLength) : fallback);
}

function cleanSourceIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim().toLocaleUpperCase("fr"))
    .filter((id) => /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(id))
    .slice(0, 16))];
}

function cleanContext(value: unknown) {
  if (!value || typeof value !== "object") return { lead: "", body: [] as string[], sources: [] as string[], userRequest: "" };
  const context = value as ReportContext;
  return {
    lead: cleanText(context.lead, "", 1_000),
    body: Array.isArray(context.body)
      ? context.body.filter((paragraph): paragraph is string => typeof paragraph === "string").map((paragraph) => cleanText(paragraph, "", 1_500)).filter(Boolean).slice(0, 10)
      : [],
    sources: cleanSourceIds(context.sources),
    userRequest: cleanText(context.userRequest, "", 500),
  };
}

function drawEvidenceCard(page: PDFPage, regular: PDFFont, bold: PDFFont, record: OpsMemoryRecord, y: number) {
  const cardHeight = 100;
  page.drawRectangle({ x: 42, y: y - cardHeight, width: PAGE_WIDTH - 84, height: cardHeight, color: SOFT, borderColor: LINE, borderWidth: .6 });
  page.drawText(printable(record.id), { x: 56, y: y - 22, size: 7.5, font: bold, color: BLUE });
  page.drawText(printable(record.title), { x: 156, y: y - 23, size: 11, font: bold, color: NAVY });
  const summaryY = drawParagraph(page, record.summary, { x: 56, y: y - 47, width: PAGE_WIDTH - 112, font: regular, size: 8.5, color: INK, lineHeight: 12 });
  const firstFact = record.facts[0];
  if (firstFact) drawParagraph(page, `Fait contrôlé : ${firstFact}`, { x: 56, y: summaryY - 6, width: PAGE_WIDTH - 112, font: regular, size: 7.5, color: MUTED, lineHeight: 10 });
  return y - cardHeight - 12;
}

export async function POST(request: Request) {
  const blocked = guardPostRequest(request, "document-generation", 12);
  if (blocked) return blocked;

  const payload = await request.json().catch(() => ({})) as ReportPayload;
  const topic = cleanText(payload.topic, "Rapport de direction 2026", 260);
  const title = cleanText(payload.title, topic, 180);
  const context = cleanContext(payload.context);
  const requestedSourceIds = [...new Set([...cleanSourceIds(payload.sourceIds), ...context.sources])];
  const isMarginReport = /marge|rivoli|rentabilit/i.test(`${title} ${topic}`)
    || requestedSourceIds.includes("PROJET-241");
  const marginSourceIds = ["PROJET-241", "TEMPS-086", "ACHAT-109", "FACT-882", "ALERT-201", "VAL-063"];
  const sourceIds = isMarginReport ? marginSourceIds : requestedSourceIds;
  const selectedRecords = sourceIds.length
    ? getMemoryRecords(sourceIds)
    : searchCompanyMemory(`${title} ${topic}`, [], 9);
  const finalSourceIds = selectedRecords.length
    ? selectedRecords.map((record) => record.id)
    : ["STRAT-2026-Q3", "FIN-SNAPSHOT-20260715", "CRM-SNAPSHOT-20260715"];
  const evidenceRecords = selectedRecords.length ? selectedRecords : getMemoryRecords(finalSourceIds);
  const parisDay = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Paris" }).format(new Date());
  const documentId = `RAPPORT-${parisDay.replaceAll("-", "")}`;
  const generatedAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date());

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  pdf.setTitle(title);
  pdf.setAuthor("OPS — Atelier Beaumarchais");
  pdf.setSubject(topic);
  pdf.setKeywords(["OPS", "direction", "rapport", "Atelier Beaumarchais", "2026"]);
  pdf.setCreationDate(new Date());

  const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: rgb(1, 1, 1) });
  cover.drawText("OPS°", { x: 46, y: PAGE_HEIGHT - 62, size: 20, font: bold, color: NAVY });
  cover.drawText("MÉMOIRE DE DIRECTION", { x: 46, y: PAGE_HEIGHT - 92, size: 7.5, font: bold, color: MUTED });
  cover.drawCircle({ x: PAGE_WIDTH - 104, y: PAGE_HEIGHT - 112, size: 54, color: rgb(.90, .94, .99) });
  cover.drawCircle({ x: PAGE_WIDTH - 104, y: PAGE_HEIGHT - 112, size: 26, color: BLUE, opacity: .88 });
  const coverTitleBottom = drawParagraph(cover, title, { x: 46, y: 486, width: 475, font: bold, size: 31, color: NAVY, lineHeight: 36 });
  cover.drawText("Atelier Beaumarchais", { x: 46, y: coverTitleBottom - 24, size: 15, font: regular, color: INK });
  cover.drawText(isMarginReport ? "Diagnostic de marge, preuves et plan correctif." : "Décisions, chiffres et priorités reliés à leurs sources.", { x: 46, y: coverTitleBottom - 51, size: 10, font: italic, color: MUTED });
  cover.drawLine({ start: { x: 46, y: 120 }, end: { x: PAGE_WIDTH - 46, y: 120 }, thickness: .7, color: LINE });
  cover.drawText(documentId, { x: 46, y: 94, size: 8, font: bold, color: BLUE });
  cover.drawText(printable(`Généré le ${generatedAt} · Données de démonstration`), { x: 46, y: 72, size: 8, font: regular, color: MUTED });

  const summary = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(summary, regular, bold, "Synthèse exécutive", 2);
  summary.drawText("Ce que la direction doit retenir", { x: 42, y: 730, size: 24, font: bold, color: NAVY });
  const executiveSummary = isMarginReport
    ? "La marge projetée du chantier Rivoli passe de 31 % à 28,9 %, soit un écart économique de 2 520 €. Rivoli concentre 82 % de l'écart de marge atelier. Les causes confirmées sont les heures non facturées, le dépassement du placage chêne et l'allongement du planning."
    : context.lead || context.body[0] || "L'entreprise maintient une dynamique commerciale positive, mais doit convertir cette croissance en marge et en trésorerie. Le pipeline atteint 184 K€ et le chiffre d'affaires mensuel progresse de 12 %. L'écart principal reste la marge atelier, à 29 % contre un objectif de 32 %.";
  let y = drawParagraph(summary, executiveSummary, { x: 42, y: 696, width: 500, font: regular, size: 10.5, color: MUTED });
  y -= 26;
  if (isMarginReport) {
    drawMetric(summary, regular, bold, 42, y - 86, "Marge initiale", "31 %", "base du chantier");
    drawMetric(summary, regular, bold, 171, y - 86, "Marge projetée", "28,9 %", "écart de -2,1 pts");
    drawMetric(summary, regular, bold, 300, y - 86, "Écart expliqué", "82 %", "Rivoli concentre l'écart");
    drawMetric(summary, regular, bold, 429, y - 86, "Marge récupérable", "+1,9 pt", "avec avenant 6,8 K€");
  } else {
    drawMetric(summary, regular, bold, 42, y - 86, "Pipeline ouvert", "184 K€", "84 % de l'objectif T3");
    drawMetric(summary, regular, bold, 171, y - 86, "CA du mois", "42,8 K€", "+12 % vs mois précédent");
    drawMetric(summary, regular, bold, 300, y - 86, "Marge moyenne", "29 %", "objectif 32 %");
    drawMetric(summary, regular, bold, 429, y - 86, "Créances", "24,3 K€", "3 dossiers à traiter");
  }
  y -= 132;
  summary.drawText("Diagnostic", { x: 42, y, size: 14, font: bold, color: NAVY });
  const diagnosis = isMarginReport
    ? "Quatorze heures non facturées représentent 630 €. Le placage chêne dépasse le budget de 1 438 €. Le solde provient principalement de quatre jours de planning supplémentaires. La situation de facturation FACT-882 n'intègre encore ni les heures ni le dépassement d'achat."
    : context.body.slice(0, 3).join(" ") || "Le chantier Rivoli concentre 82 % de l'écart de marge. Quatorze heures non facturées et un dépassement de 1 438 € sur le placage chêne expliquent l'essentiel du décrochage. Un avenant de 6,8 K€ permettrait de protéger 1,9 point de marge.";
  y = drawParagraph(summary, diagnosis, { x: 42, y: y - 24, width: 500, font: regular, size: 10.5, color: INK });
  y -= 22;
  summary.drawText("Arbitrage recommandé", { x: 42, y, size: 14, font: bold, color: NAVY });
  drawParagraph(summary, isMarginReport
    ? "Préparer l'avenant de 6,8 K€, vérifier le rattachement des heures et du placage, puis faire valider VAL-063 avant tout envoi au client. Cette séquence protège environ 1,9 point de marge sans masquer le solde restant à surveiller."
    : "Valider l'avenant Rivoli avant midi, lancer les deux relances clients déjà préparées et transférer 200 € de Meta vers Google Search. Ces trois décisions combinent un effet immédiat sur la marge, la trésorerie et la création de pipeline.", { x: 42, y: y - 24, width: 500, font: regular, size: 10.5, color: INK });

  const plan = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(plan, regular, bold, "Plan d'action", 3);
  plan.drawText(isMarginReport ? "Plan correctif — chantier Rivoli" : "Plan de direction — 90 jours", { x: 42, y: 730, size: 24, font: bold, color: NAVY });
  const actions = isMarginReport ? [
    ["01", "Corriger les temps", "Rattacher TEMPS-086 au bon poste de travail, confirmer les 14 heures avec Hugo et empêcher leur répétition dans la prochaine situation."],
    ["02", "Régulariser l'achat", "Documenter l'écart de 1 438 € sur le placage chêne, confirmer son lien avec la demande client et l'intégrer au chiffrage de l'avenant."],
    ["03", "Protéger la facturation", "Mettre à jour FACT-882 pour que les coûts additionnels ne restent pas absorbés silencieusement par la marge du chantier."],
    ["04", "Faire valider l'avenant", "Présenter l'avenant de 6,8 K€ avec son périmètre, son impact de +1,9 point et ses preuves. Aucun envoi externe avant validation de Marie."],
  ] : [
    ["01", "Protéger la marge", "Finaliser l'avenant Rivoli, rattacher chaque achat hors budget à un projet et rendre obligatoire la saisie des heures non facturables."],
    ["02", "Accélérer le cash", "Relancer Atelier Sud et Nova aujourd'hui, respecter l'attente annoncée par Maison Cobalt et piloter le délai moyen de règlement chaque semaine."],
    ["03", "Concentrer l'acquisition", "Renforcer Google Search sur la requête agencement hôtel Paris, suspendre la créa Meta en fatigue et transformer Rivoli en étude de cas SEO."],
    ["04", "Sécuriser le savoir", "Documenter la calibration CNC avec Thomas, enregistrer une démonstration et faire valider la procédure par Hugo avant la fin du mois."],
  ];
  let actionY = 670;
  for (const [index, actionTitle, description] of actions) {
    plan.drawText(index, { x: 42, y: actionY, size: 9, font: bold, color: BLUE });
    plan.drawText(printable(actionTitle), { x: 82, y: actionY - 2, size: 13, font: bold, color: NAVY });
    drawParagraph(plan, description, { x: 82, y: actionY - 25, width: 450, font: regular, size: 9.5, color: MUTED, lineHeight: 14 });
    actionY -= 112;
  }
  plan.drawLine({ start: { x: 42, y: 204 }, end: { x: PAGE_WIDTH - 42, y: 204 }, thickness: .7, color: LINE });
  plan.drawText("Sources utilisées", { x: 42, y: 176, size: 11, font: bold, color: NAVY });
  drawParagraph(plan, finalSourceIds.join(" · "), { x: 42, y: 154, width: 500, font: regular, size: 8, color: MUTED, lineHeight: 12 });
  plan.drawText("Toute action externe reste soumise à validation humaine.", { x: 42, y: 74, size: 8, font: italic, color: MUTED });

  const evidence = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(evidence, regular, bold, "Registre des preuves", 4);
  evidence.drawText("Les pièces qui fondent l'analyse", { x: 42, y: 730, size: 24, font: bold, color: NAVY });
  drawParagraph(evidence, `${finalSourceIds.length} enregistrements sont reliés à ce rapport. Les montants et recommandations du document peuvent être retrouvés dans la mémoire OPS à partir de ces identifiants.`, { x: 42, y: 697, width: 500, font: regular, size: 9.5, color: MUTED });
  let evidenceY = 642;
  for (const record of evidenceRecords.slice(0, 5)) evidenceY = drawEvidenceCard(evidence, regular, bold, record, evidenceY);
  evidence.drawText("Registre complet", { x: 42, y: 83, size: 8, font: bold, color: NAVY });
  drawParagraph(evidence, finalSourceIds.join(" · "), { x: 126, y: 83, width: 425, font: regular, size: 7.5, color: MUTED, lineHeight: 10 });

  const bytes = await pdf.save();
  const filename = `${slugify(title) || "rapport-ops"}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Document-Id": documentId,
      "X-Document-Pages": String(pdf.getPageCount()),
      "X-Document-Sources": String(finalSourceIds.length),
    },
  });
}
