import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { z } from "zod";
import { guardPostRequest } from "@/lib/api-guard";
import { createDocumentId, persistDocument } from "@/lib/document-store";
import type { StoredOpsDocument } from "@/lib/ops-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = rgb(0.025, 0.105, 0.22);
const INK = rgb(0.09, 0.11, 0.14);
const MUTED = rgb(0.40, 0.43, 0.47);
const LINE = rgb(0.89, 0.90, 0.91);
const SOFT = rgb(0.965, 0.973, 0.982);
const BLUE = rgb(0.20, 0.43, 0.70);
const GREEN = rgb(0.28, 0.51, 0.39);

const sectionSchema = z.object({
  title: z.string().trim().min(1).max(180),
  paragraphs: z.array(z.string().trim().min(1).max(4_000)).max(12).default([]),
  bullets: z.array(z.string().trim().min(1).max(1_200)).max(16).default([]),
});

const decisionSchema = z.object({
  title: z.string().trim().min(1).max(180),
  rationale: z.string().trim().min(1).max(1_200),
  owner: z.string().trim().max(120).optional(),
  horizon: z.string().trim().max(120).optional(),
  indicator: z.string().trim().max(180).optional(),
});

const payloadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  subtitle: z.string().trim().max(260).optional(),
  executiveSummary: z.string().trim().min(1).max(6_000),
  sections: z.array(sectionSchema).min(1).max(14),
  decisions: z.array(decisionSchema).max(10).default([]),
  sources: z.array(z.string().trim().min(1).max(300)).max(40).default([]),
});

function printable(value: string) {
  return value
    .replaceAll("\u202f", " ")
    .replaceAll("\u00a0", " ")
    .replace(/\u2022/g, "-")
    .replace(/[^\u0000-\u00ff\u20ac\u2013\u2014\u2018\u2019\u201c\u201d]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const rawParagraph of printable(text).split(/\n+/)) {
    const words = rawParagraph.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} o`;
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1_024))} Ko`;
  return `${(bytes / 1_048_576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

function safeFilename(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return `${slug || "rapport-ops"}.pdf`;
}

function drawPageChrome(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  section: string,
  pageNumber: number,
) {
  page.drawText("OPS°", {
    x: MARGIN,
    y: PAGE_HEIGHT - 45,
    size: 14,
    font: bold,
    color: NAVY,
  });
  page.drawText(printable(section.toLocaleUpperCase("fr")), {
    x: 105,
    y: PAGE_HEIGHT - 43,
    size: 7,
    font: bold,
    color: MUTED,
  });
  page.drawText(String(pageNumber).padStart(2, "0"), {
    x: PAGE_WIDTH - 58,
    y: PAGE_HEIGHT - 43,
    size: 8,
    font: regular,
    color: MUTED,
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - 58 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 58 },
    thickness: 0.7,
    color: LINE,
  });
}

function drawLines(
  page: PDFPage,
  lines: string[],
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    lineHeight: number;
    color: ReturnType<typeof rgb>;
  },
) {
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * options.lineHeight,
      font: options.font,
      size: options.size,
      color: options.color,
    });
  });
  return options.y - lines.length * options.lineHeight;
}

export async function POST(request: Request) {
  const blocked = guardPostRequest(request, "document-generation", 10);
  if (blocked) return blocked;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_document_plan", issues: parsed.error.issues.map((issue) => issue.path.join(".")) },
      { status: 400 },
    );
  }

  const plan = parsed.data;
  const sourceIds = [...new Set(plan.sources.map((source) => source.trim()).filter(Boolean))];
  const documentId = createDocumentId();
  const createdAt = new Date().toISOString();
  const generatedAt = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date());

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  pdf.setTitle(plan.title);
  pdf.setAuthor("OPS");
  pdf.setSubject(plan.subtitle || plan.executiveSummary.slice(0, 220));
  pdf.setKeywords(["OPS", "mémoire d’entreprise", ...sourceIds.slice(0, 12)]);
  pdf.setCreationDate(new Date());

  const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cover.drawText("OPS°", { x: MARGIN, y: PAGE_HEIGHT - 64, size: 20, font: bold, color: NAVY });
  cover.drawText("MÉMOIRE DE DIRECTION", {
    x: MARGIN,
    y: PAGE_HEIGHT - 94,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  cover.drawCircle({
    x: PAGE_WIDTH - 104,
    y: PAGE_HEIGHT - 116,
    size: 56,
    color: rgb(0.91, 0.95, 0.99),
  });
  cover.drawCircle({
    x: PAGE_WIDTH - 104,
    y: PAGE_HEIGHT - 116,
    size: 27,
    color: BLUE,
    opacity: 0.9,
  });
  let coverY = drawLines(
    cover,
    wrapText(plan.title, bold, 31, CONTENT_WIDTH - 10),
    { x: MARGIN, y: 500, font: bold, size: 31, lineHeight: 37, color: NAVY },
  );
  if (plan.subtitle) {
    coverY = drawLines(
      cover,
      wrapText(plan.subtitle, regular, 13, CONTENT_WIDTH - 10),
      { x: MARGIN, y: coverY - 18, font: regular, size: 13, lineHeight: 19, color: MUTED },
    );
  }
  cover.drawLine({
    start: { x: MARGIN, y: 122 },
    end: { x: PAGE_WIDTH - MARGIN, y: 122 },
    thickness: 0.7,
    color: LINE,
  });
  cover.drawText(documentId, { x: MARGIN, y: 95, size: 8, font: bold, color: BLUE });
  cover.drawText(printable(`Généré le ${generatedAt}`), {
    x: MARGIN,
    y: 73,
    size: 8,
    font: regular,
    color: MUTED,
  });

  const summary = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageChrome(summary, regular, bold, "Synthèse exécutive", 2);
  summary.drawText("Ce qu’il faut retenir", {
    x: MARGIN,
    y: 730,
    size: 25,
    font: bold,
    color: NAVY,
  });
  let summaryY = drawLines(
    summary,
    wrapText(plan.executiveSummary, regular, 11, CONTENT_WIDTH),
    { x: MARGIN, y: 688, font: regular, size: 11, lineHeight: 17, color: INK },
  );
  summaryY -= 24;
  summary.drawRectangle({
    x: MARGIN,
    y: Math.max(90, summaryY - 128),
    width: CONTENT_WIDTH,
    height: 128,
    color: SOFT,
    borderColor: LINE,
    borderWidth: 0.5,
  });
  summary.drawText("TRACE DE LA MÉMOIRE", {
    x: MARGIN + 18,
    y: summaryY - 28,
    size: 7.5,
    font: bold,
    color: GREEN,
  });
  drawLines(
    summary,
    wrapText(
      sourceIds.length
        ? `${sourceIds.length} sources ont été retenues par OPS pour construire ce document. Elles sont listées dans le registre final.`
        : "Aucune source n’a été jointe à ce document. Les affirmations doivent être vérifiées avant décision.",
      regular,
      9,
      CONTENT_WIDTH - 36,
    ),
    { x: MARGIN + 18, y: summaryY - 55, font: regular, size: 9, lineHeight: 14, color: MUTED },
  );

  let pageNumber = 3;
  let contentPage: PDFPage | null = null;
  let y = 0;
  const newContentPage = (label: string) => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageChrome(page, regular, bold, label, pageNumber);
    pageNumber += 1;
    y = 735;
    contentPage = page;
    return page;
  };
  const ensureSpace = (needed: number, label: string) => {
    if (!contentPage || y - needed < 78) return newContentPage(label);
    return contentPage;
  };

  for (const section of plan.sections) {
    const titleLines = wrapText(section.title, bold, 20, CONTENT_WIDTH);
    const estimatedHeight = (
      titleLines.length * 25
      + 33
      + section.paragraphs.reduce((height, paragraph) => (
        height + wrapText(paragraph, regular, 10.25, CONTENT_WIDTH).length * 15 + 30
      ), 0)
      + section.bullets.reduce((height, bullet) => (
        height + wrapText(bullet, regular, 9.7, CONTENT_WIDTH - 28).length * 14 + 22
      ), 0)
    );
    if (contentPage && estimatedHeight <= 650 && y - estimatedHeight < 78) {
      newContentPage(section.title);
    }

    let page = ensureSpace(86, section.title);
    y = drawLines(page, titleLines, {
      x: MARGIN,
      y,
      font: bold,
      size: 20,
      lineHeight: 25,
      color: NAVY,
    }) - 18;

    for (const paragraph of section.paragraphs) {
      const lines = wrapText(paragraph, regular, 10.25, CONTENT_WIDTH);
      const needed = lines.length * 15 + 16;
      page = ensureSpace(needed, section.title);
      y = drawLines(page, lines, {
        x: MARGIN,
        y,
        font: regular,
        size: 10.25,
        lineHeight: 15,
        color: INK,
      }) - 14;
    }

    for (const bullet of section.bullets) {
      const lines = wrapText(bullet, regular, 9.7, CONTENT_WIDTH - 28);
      const needed = lines.length * 14 + 12;
      page = ensureSpace(needed, section.title);
      page.drawCircle({ x: MARGIN + 4, y: y + 2, size: 2.2, color: BLUE });
      y = drawLines(page, lines, {
        x: MARGIN + 18,
        y,
        font: regular,
        size: 9.7,
        lineHeight: 14,
        color: INK,
      }) - 10;
    }
    y -= 15;
  }

  if (plan.decisions.length) {
    const newDecisionsPage = (continued = false) => {
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageChrome(page, regular, bold, "Décisions", pageNumber++);
      page.drawText(
        continued ? "Décisions et prochaines actions — suite" : "Décisions et prochaines actions",
        {
          x: MARGIN,
          y: 730,
          size: continued ? 21 : 24,
          font: bold,
          color: NAVY,
        },
      );
      return page;
    };
    let decisionsPage = newDecisionsPage();
    let decisionY = 675;
    for (const [index, decision] of plan.decisions.entries()) {
      const titleLines = wrapText(`${index + 1}. ${decision.title}`, bold, 12, CONTENT_WIDTH - 22);
      const rationaleLines = wrapText(decision.rationale, regular, 9, CONTENT_WIDTH - 36);
      const metadata = [
        decision.owner ? `Responsable : ${decision.owner}` : "",
        decision.horizon ? `Horizon : ${decision.horizon}` : "",
        decision.indicator ? `Indicateur : ${decision.indicator}` : "",
      ].filter(Boolean).join("  ·  ");
      const metaLines = metadata ? wrapText(metadata, regular, 7.7, CONTENT_WIDTH - 36) : [];
      const height = Math.max(90, titleLines.length * 15 + rationaleLines.length * 13 + metaLines.length * 11 + 34);
      if (decisionY - height < 68) {
        decisionsPage = newDecisionsPage(true);
        decisionY = 675;
      }
      decisionsPage.drawRectangle({
        x: MARGIN,
        y: decisionY - height,
        width: CONTENT_WIDTH,
        height,
        color: SOFT,
        borderColor: LINE,
        borderWidth: 0.5,
      });
      let cardY = drawLines(decisionsPage, titleLines, {
        x: MARGIN + 16,
        y: decisionY - 22,
        font: bold,
        size: 12,
        lineHeight: 15,
        color: NAVY,
      }) - 8;
      cardY = drawLines(decisionsPage, rationaleLines, {
        x: MARGIN + 16,
        y: cardY,
        font: regular,
        size: 9,
        lineHeight: 13,
        color: INK,
      }) - 10;
      if (metaLines.length) {
        drawLines(decisionsPage, metaLines, {
          x: MARGIN + 16,
          y: cardY,
          font: italic,
          size: 7.7,
          lineHeight: 11,
          color: MUTED,
        });
      }
      decisionY -= height + 12;
    }
  }

  const newSourcesPage = (continued = false) => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageChrome(page, regular, bold, "Registre des sources", pageNumber++);
    page.drawText(continued ? "Sources utilisées — suite" : "Sources utilisées", {
      x: MARGIN,
      y: 730,
      size: continued ? 21 : 24,
      font: bold,
      color: NAVY,
    });
    if (!continued) {
      drawLines(
        page,
        wrapText(
          sourceIds.length
            ? "Ces identifiants et chemins ont été retournés par la mémoire OPS pendant l’analyse."
            : "Aucune source n’a été retournée. Ce document ne doit pas être utilisé pour une décision engageante.",
          regular,
          9.5,
          CONTENT_WIDTH,
        ),
        { x: MARGIN, y: 694, font: regular, size: 9.5, lineHeight: 14, color: MUTED },
      );
    }
    return page;
  };
  let sourcesPage = newSourcesPage();
  let sourceY = 635;
  for (const source of sourceIds) {
    const lines = wrapText(source, bold, 8.5, CONTENT_WIDTH - 40);
    if (sourceY - lines.length * 12 < 72) {
      sourcesPage = newSourcesPage(true);
      sourceY = 675;
    }
    sourcesPage.drawCircle({ x: MARGIN + 5, y: sourceY + 2, size: 2.2, color: GREEN });
    sourceY = drawLines(sourcesPage, lines, {
      x: MARGIN + 20,
      y: sourceY,
      font: bold,
      size: 8.5,
      lineHeight: 12,
      color: INK,
    }) - 12;
  }
  sourcesPage.drawText("Toute action externe reste soumise à validation humaine.", {
    x: MARGIN,
    y: 52,
    size: 8,
    font: italic,
    color: MUTED,
  });

  const bytes = await pdf.save();
  const filename = safeFilename(plan.title);
  const metadata: StoredOpsDocument = {
    id: documentId,
    name: filename,
    type: "Rapport PDF",
    linked: plan.subtitle || "Direction",
    owner: "OPS",
    updated: "À l’instant",
    status: "Généré",
    facts: sourceIds.length,
    size: formatBytes(bytes.byteLength),
    sizeBytes: bytes.byteLength,
    pages: pdf.getPageCount(),
    generated: true,
    url: `/api/documents/${documentId}`,
    downloadUrl: `/api/documents/${documentId}?download=1`,
    createdAt,
    sources: sourceIds,
  };

  await persistDocument(metadata, bytes);

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Document-Id": documentId,
      "X-Document-Name": encodeURIComponent(filename),
      "X-Document-Pages": String(pdf.getPageCount()),
      "X-Document-Sources": String(sourceIds.length),
      "X-Document-Url": metadata.url,
    },
  });
}
