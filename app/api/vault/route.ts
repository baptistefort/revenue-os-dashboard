import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { BrainEdge, BrainNode } from "@/lib/ops-demo-data";

export const dynamic = "force-dynamic";
const GRAPH_NODE_LIMIT = 1_200;

const supportedTypes = new Set<BrainNode["type"]>([
  "company",
  "person",
  "client",
  "project",
  "document",
  "finance",
  "marketing",
  "decision",
  "knowledge",
]);

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) return [];
      return walk(fullPath);
    }
    return entry.name.endsWith(".md") ? [fullPath] : [];
  }));
  return nested.flat();
}

function field(content: string, name: string) {
  return content.match(new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, "mi"))?.[1]?.trim();
}

function normalizeType(value?: string, recordKind?: string): BrainNode["type"] {
  const type = value?.toLocaleLowerCase("fr");
  const kind = recordKind?.toLocaleLowerCase("fr");
  if (kind === "client") return "client";
  if (kind === "email") return "document";
  if (kind === "opportunity" || kind === "task") return "project";
  if (type && supportedTypes.has(type as BrainNode["type"])) return type as BrainNode["type"];
  if (type === "entity" || type === "account" || type === "customer") return "client";
  if (type === "report" || type === "pdf" || type === "attachment" || type === "note") return "document";
  if (type === "invoice" || type === "payment" || type === "purchase") return "finance";
  if (type === "opportunity" || type === "task") return "project";
  if (type === "strategy" || type === "rule" || type === "alert") return "decision";
  if (type === "email" || type === "meeting" || type === "procedure") return "document";
  return "knowledge";
}

function deterministicPosition(index: number, total: number, type: BrainNode["type"]) {
  const centers: Record<BrainNode["type"], [number, number]> = {
    company: [500, 330], person: [500, 210], client: [270, 360], project: [310, 170],
    document: [175, 500], finance: [700, 520], marketing: [805, 185], decision: [535, 530], knowledge: [785, 350],
  };
  const [cx, cy] = centers[type];
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + type.length * .31;
  const radius = type === "company" ? 0 : 48 + (index % 4) * 23;
  return { x: Math.round(cx + Math.cos(angle) * radius), y: Math.round(cy + Math.sin(angle) * radius) };
}

export async function GET() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) return NextResponse.json({ available: false, source: "demo" });

  try {
    const allFiles = await walk(vaultPath);
    const demoFiles = allFiles.filter((filePath) => filePath.includes(`OPS Demo — Atelier Beaumarchais${path.sep}`));
    const files = demoFiles.length ? demoFiles : allFiles;
    const parsedRecords = await Promise.all(files.map(async (filePath) => {
      const content = await fs.readFile(filePath, "utf8");
      const basename = path.basename(filePath, ".md");
      const id = field(content, "id") ?? basename.split(" — ")[0];
      const label = field(content, "title") ?? basename.replace(/^[A-Z]+-[\w-]+\s*—\s*/, "");
      const type = normalizeType(field(content, "type"), field(content, "record_kind"));
      const mainBody = content
        .replace(/^---[\s\S]*?---/m, "")
        .replace(/^#\s+.*$/m, "")
        .split(/^##\s+/m)[0];
      const summary = mainBody
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180) || `Élément de mémoire ${label}.`;
      const links = [...content.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim());
      return {
        id,
        label,
        type,
        summary,
        links,
        basename,
        archived: field(content, "archived")?.toLocaleLowerCase("fr") === "true",
      };
    }));
    const typePriority: Record<BrainNode["type"], number> = {
      company: 0,
      person: 1,
      client: 2,
      project: 3,
      finance: 4,
      marketing: 5,
      decision: 6,
      knowledge: 7,
      document: 8,
    };
    const records = parsedRecords
      .filter((record) => !record.archived)
      .sort((a, b) => typePriority[a.type] - typePriority[b.type] || b.links.length - a.links.length)
      .slice(0, GRAPH_NODE_LIMIT);

    const aliasToId = new Map<string, string>();
    records.forEach((record) => {
      aliasToId.set(record.id, record.id);
      aliasToId.set(record.basename, record.id);
      aliasToId.set(record.label, record.id);
    });

    const nodes: BrainNode[] = records.map((record, index) => {
      const position = deterministicPosition(index, records.length, record.type);
      return {
        id: record.id,
        label: record.label,
        type: record.type,
        x: position.x,
        y: position.y,
        size: record.type === "company" ? 39 : 16 + Math.min(record.links.length, 7) * 1.25,
        summary: record.summary,
        source: "obsidian",
      };
    });

    const edgeKeys = new Set<string>();
    const edges: BrainEdge[] = [];
    records.forEach((record) => {
      record.links.forEach((link) => {
        const target = aliasToId.get(link) ?? aliasToId.get(link.split("/").at(-1) ?? "");
        if (!target || target === record.id) return;
        const key = [record.id, target].sort().join("::");
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        edges.push({ from: record.id, to: target, type: "confirmed" });
      });
    });

    return NextResponse.json({ available: nodes.length > 3 && edges.length > 2, source: "obsidian", nodes, edges });
  } catch {
    return NextResponse.json({ available: false, source: "demo" });
  }
}
