export type OpsInlineKind = "text" | "strong" | "emphasis" | "code" | "citation";

export type OpsInlineSegment = {
  kind: OpsInlineKind;
  text: string;
};

export type OpsResponseBlock =
  | { kind: "heading"; level: 2 | 3 | 4; content: OpsInlineSegment[] }
  | { kind: "paragraph"; content: OpsInlineSegment[] }
  | { kind: "list"; ordered: boolean; items: OpsInlineSegment[][] }
  | { kind: "table"; headers: OpsInlineSegment[][]; rows: OpsInlineSegment[][][] };

const HEADING = /^(#{1,3})\s+(.+)$/;
const UNORDERED_ITEM = /^\s*[-*•]\s+(.+)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.+)$/;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;

function tableCells(line: string) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
  const cells = tableCells(line);
  return cells.length > 1 && cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell));
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index] ?? "";
  if (!line.trim()) return true;
  if (HEADING.test(line) || UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line)) return true;
  return line.includes("|") && isTableSeparator(lines[index + 1] ?? "");
}

/**
 * Parses the small, intentionally constrained Markdown dialect emitted by OPS.
 * It never renders raw HTML, links or arbitrary attributes, so model output
 * remains plain React content rather than becoming an injection surface.
 */
export function parseOpsInline(value: string): OpsInlineSegment[] {
  const segments: OpsInlineSegment[] = [];
  const token = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|\[[A-Z0-9][A-Z0-9_.:/-]{2,}\])/g;
  let cursor = 0;

  for (const match of value.matchAll(token)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: "text", text: value.slice(cursor, start) });
    const raw = match[0];
    if (raw.startsWith("**")) {
      segments.push({ kind: "strong", text: raw.slice(2, -2) });
    } else if (raw.startsWith("`")) {
      segments.push({ kind: "code", text: raw.slice(1, -1) });
    } else if (raw.startsWith("*")) {
      segments.push({ kind: "emphasis", text: raw.slice(1, -1) });
    } else {
      segments.push({ kind: "citation", text: raw.slice(1, -1) });
    }
    cursor = start + raw.length;
  }

  if (cursor < value.length) segments.push({ kind: "text", text: value.slice(cursor) });
  return segments.length ? segments : [{ kind: "text", text: value }];
}

export function parseOpsResponseMarkdown(value: string): OpsResponseBlock[] {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: OpsResponseBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const current = lines[index];
    if (!current.trim()) {
      index += 1;
      continue;
    }

    const heading = current.match(HEADING);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: (Number(heading[1].length) + 1) as 2 | 3 | 4,
        content: parseOpsInline(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    if (current.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      const headers = tableCells(current).map(parseOpsInline);
      index += 2;
      const rows: OpsInlineSegment[][][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const row = tableCells(lines[index]);
        if (row.length !== headers.length) break;
        rows.push(row.map(parseOpsInline));
        index += 1;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    const unordered = current.match(UNORDERED_ITEM);
    const ordered = current.match(ORDERED_ITEM);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const matcher = orderedList ? ORDERED_ITEM : UNORDERED_ITEM;
      const items: OpsInlineSegment[][] = [];
      while (index < lines.length) {
        const item = lines[index].match(matcher);
        if (!item) break;
        items.push(parseOpsInline(item[1].trim()));
        index += 1;
      }
      blocks.push({ kind: "list", ordered: orderedList, items });
      continue;
    }

    const paragraph: string[] = [current.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", content: parseOpsInline(paragraph.join(" ")) });
  }

  return blocks;
}

export function plainTextFromOpsMarkdown(value: string) {
  return value
    .split(/\r?\n/)
    .filter((line) => !(line.includes("|") && isTableSeparator(line)))
    .map((line) => line.includes("|") ? tableCells(line).join(", ") : line)
    .join("\n")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s*\[[A-Z0-9][A-Z0-9_.:/-]{2,}\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
