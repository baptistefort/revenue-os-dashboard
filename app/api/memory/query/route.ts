import { NextResponse } from "next/server";
import {
  getMemoryRecord,
  getRelatedMemory,
  searchCompanyMemory,
  serializeMemoryRecords,
} from "@/lib/ops-memory";

export const runtime = "nodejs";

type MemoryQueryPayload = {
  id?: unknown;
  query?: unknown;
  limit?: unknown;
};

function text(value: unknown, max = 600) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as MemoryQueryPayload;
  const id = text(payload.id, 80).toLocaleUpperCase("fr");
  const query = text(payload.query);
  const limit = Math.min(12, Math.max(1, Number(payload.limit) || 10));

  if (id) {
    const record = getMemoryRecord(id);
    if (!record) {
      return NextResponse.json({
        found: false,
        spoken_summary: `${id} n’existe pas dans la mémoire disponible.`,
        display_text: `Aucun enregistrement ${id} n’a été trouvé.`,
        citations: [],
        records: [],
      });
    }

    const records = [record, ...getRelatedMemory(record)].slice(0, limit);
    return NextResponse.json({
      found: true,
      spoken_summary: `${record.id} concerne ${record.title}. ${record.summary}`,
      display_text: serializeMemoryRecords(records),
      citations: records.map((item) => item.id),
      records,
    });
  }

  if (!query) return NextResponse.json({ error: "query_or_id_required" }, { status: 400 });
  const records = searchCompanyMemory(query, [], limit);
  return NextResponse.json({
    found: records.length > 0,
    spoken_summary: records.length
      ? `${records.length} élément${records.length > 1 ? "s" : ""} pertinent${records.length > 1 ? "s" : ""} trouvé${records.length > 1 ? "s" : ""}.`
      : "Aucun fait précis n’a été trouvé pour cette demande.",
    display_text: records.length ? serializeMemoryRecords(records) : "",
    citations: records.map((record) => record.id),
    records,
  });
}
