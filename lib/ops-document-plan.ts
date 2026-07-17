import type { OpsDocumentPlan } from "@/lib/ops-document";

type DocumentPlanInput = {
  prompt: string;
  answer: string;
  sources: string[];
  artifact?: {
    kicker: string;
    title: string;
    metrics: Array<{ label: string; value: string }>;
    action: string;
  } | null;
};

const SECTION_HINT = /(?:r[eé]sum[eé]|synth[eè]se|faits?|constats?|[eé]carts?|risques?|causes?|analyse|plan d.action|actions?|responsable|indicateurs?|d[eé]cision|recommandation)/i;
const MARKDOWN_HEADING = /^#{1,3}\s+(.+)$/;
const LIST_ITEM = /^(?:[-*•]|\d+[.)])\s+(.+)$/;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;

function clean(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMarkdown(value: string, maxLength: number) {
  return clean(
    value
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1"),
    maxLength,
  );
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanMarkdown(cell, 800));
}

function isTableSeparator(line: string) {
  const cells = tableCells(line);
  return cells.length > 1 && cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell));
}

function tableRowAsBullet(headers: string[], cells: string[]) {
  return clean(
    headers
      .map((header, index) => {
        const value = cells[index];
        return value ? `${header} : ${value}` : "";
      })
      .filter(Boolean)
      .join(" · "),
    1_200,
  );
}

function answerBlocks(answer: string) {
  return answer
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function titleFromPrompt(prompt: string, answer: string, artifactTitle?: string) {
  if (artifactTitle?.trim()) return clean(artifactTitle, 180);
  const explicitTitle = answer.match(/^\s*titre\s*:\s*(.+)$/im)?.[1];
  if (explicitTitle) return clean(explicitTitle, 180);
  const subject = prompt
    .replace(/\b(?:produis|produire|g[eé]n[eè]re|g[eé]n[eé]rer|cr[eé]e|cr[eé]er|fais|faire|pr[eé]pare|pr[eé]parer|exporte|exporter|transforme|transformer)\b/gi, "")
    .replace(/\b(?:maintenant|moi|le vrai|un|une|le|la|les|ce|cette|en|au format|puis|ajoute(?:-le)?|documents?)\b/gi, "")
    .replace(/\bpdf\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return subject
    ? `Rapport OPS — ${clean(subject, 154)}`
    : "Rapport de direction OPS";
}

function parseSections(answer: string) {
  const sections: OpsDocumentPlan["sections"] = [];
  const lines = answer.replace(/\r/g, "").split("\n");
  let current: OpsDocumentPlan["sections"][number] | null = null;
  let paragraphLines: string[] = [];

  const ensureSection = (title?: string) => {
    if (current) return current;
    current = {
      title: title || (sections.length ? "Éléments complémentaires" : "Analyse de direction"),
      paragraphs: [],
      bullets: [],
    };
    sections.push(current);
    return current;
  };

  const flushParagraph = () => {
    const paragraph = cleanMarkdown(paragraphLines.join(" "), 4_000);
    paragraphLines = [];
    if (!paragraph) return;
    const section = ensureSection();
    if (section.paragraphs.length < 12) section.paragraphs.push(paragraph);
  };

  const startSection = (title: string) => {
    flushParagraph();
    const section: OpsDocumentPlan["sections"][number] = {
      title: cleanMarkdown(title.replace(/^(?:\d+[.)]\s*)/, ""), 180),
      paragraphs: [],
      bullets: [],
    };
    current = section;
    sections.push(section);
    return section;
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();

    if (!line) {
      flushParagraph();
      index += 1;
      continue;
    }

    const markdownHeading = line.match(MARKDOWN_HEADING);
    if (markdownHeading) {
      startSection(markdownHeading[1]);
      index += 1;
      continue;
    }

    if (line.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      flushParagraph();
      const headers = tableCells(line);
      const section = ensureSection(sections.length ? undefined : "Comparatif");
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = tableCells(lines[index]);
        if (cells.length !== headers.length) break;
        const bullet = tableRowAsBullet(headers, cells);
        if (bullet && section.bullets.length < 16) section.bullets.push(bullet);
        index += 1;
      }
      continue;
    }

    const legacyHeading = line.match(/^(?:\d+[.)]\s*)?([^:\n]{2,90})\s*:\s*(.*)$/);
    if (legacyHeading && SECTION_HINT.test(legacyHeading[1])) {
      const section = startSection(legacyHeading[1]);
      const content = cleanMarkdown(legacyHeading[2], 4_000);
      if (content) section.paragraphs.push(content);
      index += 1;
      continue;
    }

    const listItem = line.match(LIST_ITEM);
    if (listItem) {
      flushParagraph();
      const section = ensureSection();
      if (section.bullets.length < 16) {
        section.bullets.push(cleanMarkdown(listItem[1], 1_200));
      }
      index += 1;
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }
  flushParagraph();

  return sections.length
    ? sections.slice(0, 14)
    : [{
        title: "Analyse de direction",
        paragraphs: [clean(answer, 4_000)],
        bullets: [],
      }];
}

function executiveSummary(answer: string) {
  const sections = parseSections(answer);
  const explicit = sections.find((section) => /^(?:r[eé]sum[eé]|synth[eè]se|conclusion)\b/i.test(section.title));
  const explicitContent = explicit
    ? [...explicit.paragraphs, ...explicit.bullets].join(" ")
    : "";
  if (explicitContent) return cleanMarkdown(explicitContent, 6_000);

  const firstContent = sections
    .flatMap((section) => [...section.paragraphs, ...section.bullets])
    .slice(0, 2)
    .join(" ");
  return cleanMarkdown(firstContent || answer, 6_000);
}

export function buildDocumentPlanFromAgent({
  prompt,
  answer,
  sources,
  artifact,
}: DocumentPlanInput): OpsDocumentPlan {
  const decisionBlock = answerBlocks(answer).find((block) => /^d[eé]cision(?:\s+propos[eé]e)?\b/i.test(block));
  const decisionRationale = decisionBlock
    ?.replace(/^d[eé]cision(?:\s+propos[eé]e)?\s*:?\s*/i, "")
    .trim();
  const decisions = artifact
    ? [{
        title: clean(artifact.title, 180),
        rationale: clean(artifact.action, 1_200),
        indicator: artifact.metrics.length
          ? clean(artifact.metrics.map((metric) => `${metric.label} : ${metric.value}`).join(" · "), 180)
          : undefined,
      }]
    : decisionRationale
      ? [{
          title: "Décision proposée",
          rationale: clean(decisionRationale, 1_200),
        }]
      : [];

  return {
    title: titleFromPrompt(prompt, answer, artifact?.title),
    subtitle: "Document de direction · Atelier Beaumarchais",
    executiveSummary: executiveSummary(answer),
    sections: parseSections(answer),
    decisions,
    sources,
  };
}
