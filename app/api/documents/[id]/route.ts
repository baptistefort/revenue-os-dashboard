import { readDocumentMetadata, readDocumentPdf } from "@/lib/document-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const [metadata, pdf] = await Promise.all([
    readDocumentMetadata(id),
    readDocumentPdf(id),
  ]);
  if (!metadata || !pdf) return Response.json({ error: "document_not_found" }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${metadata.name.replaceAll('"', "")}"`,
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
