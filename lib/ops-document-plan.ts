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

function clean(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
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
  const blocks = answerBlocks(answer);
  const sections: OpsDocumentPlan["sections"] = [];
  let fallbackParagraphs: string[] = [];

  const flushFallback = () => {
    if (!fallbackParagraphs.length) return;
    sections.push({
      title: sections.length ? "Éléments complémentaires" : "Analyse de direction",
      paragraphs: fallbackParagraphs.splice(0, 8),
      bullets: [],
    });
  };

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const heading = first.match(/^(?:\d+[.)]\s*)?([^:\n]{2,90})\s*:\s*(.*)$/);
    const standaloneHeading = lines.length > 1 && first.length <= 90 && SECTION_HINT.test(first);
    if ((heading && SECTION_HINT.test(heading[1])) || standaloneHeading) {
      flushFallback();
      const sectionTitle = heading?.[1] ?? first;
      const content = heading
        ? [heading[2], ...lines.slice(1)].filter(Boolean)
        : lines.slice(1);
      const bullets = content
        .filter((line) => /^(?:[-•]|\d+[.)])\s+/.test(line))
        .map((line) => clean(line.replace(/^(?:[-•]|\d+[.)])\s+/, ""), 1_200));
      const paragraphs = content
        .filter((line) => !/^(?:[-•]|\d+[.)])\s+/.test(line))
        .map((line) => clean(line, 4_000))
        .filter(Boolean);
      sections.push({
        title: clean(sectionTitle.replace(/^(?:\d+[.)]\s*)/, ""), 180),
        paragraphs: paragraphs.length ? paragraphs : [],
        bullets,
      });
      continue;
    }
    fallbackParagraphs.push(clean(block, 4_000));
    if (fallbackParagraphs.length === 8) flushFallback();
  }
  flushFallback();

  return sections.length
    ? sections.slice(0, 14)
    : [{
        title: "Analyse de direction",
        paragraphs: [clean(answer, 4_000)],
        bullets: [],
      }];
}

function executiveSummary(answer: string) {
  const blocks = answerBlocks(answer);
  const explicit = blocks.find((block) => /^(?:r[eé]sum[eé]|synth[eè]se|conclusion)\b/i.test(block));
  return clean(explicit ?? blocks.slice(0, 2).join(" "), 6_000);
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
