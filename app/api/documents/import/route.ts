import { PDFDocument } from "pdf-lib";
import { guardPostRequest } from "@/lib/api-guard";
import {
  createDocumentId,
  deleteDocument,
  DocumentStorageError,
  persistDocument,
} from "@/lib/document-store";
import { writeObsidianRecord } from "@/lib/obsidian-write";
import type { StoredOpsDocument } from "@/lib/ops-document";
import {
  buildImportedPdfMemoryBody,
  classifyPdfFailure,
  extractSearchablePdfText,
  MAX_PDF_PAGES,
  PdfProcessingError,
} from "@/lib/pdf-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} o`;
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1_024))} Ko`;
  return `${(bytes / 1_048_576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

function safePdfName(value: string) {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned || "document-importe"}.pdf`;
}

export async function POST(request: Request) {
  const blocked = guardPostRequest(request, "document-import", 12);
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = form.get("file");
  const linked = String(form.get("linked") ?? "Direction").trim().slice(0, 180) || "Direction";
  if (!(file instanceof File)) {
    return Response.json({ error: "pdf_required" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
    return Response.json({ error: "invalid_pdf_size" }, { status: 413 });
  }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    return Response.json({ error: "pdf_required" }, { status: 415 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let pageCount: number;
  try {
    const parsed = await PDFDocument.load(bytes, { ignoreEncryption: false });
    pageCount = parsed.getPageCount();
  } catch (error) {
    const failure = classifyPdfFailure(error);
    return Response.json(
      { error: failure.code },
      { status: failure.code === "encrypted_pdf" ? 422 : 400 },
    );
  }
  if (pageCount > MAX_PDF_PAGES) {
    return Response.json(
      { error: "pdf_page_limit_exceeded", limit: MAX_PDF_PAGES },
      { status: 413 },
    );
  }

  let extraction;
  try {
    extraction = await extractSearchablePdfText(bytes, pageCount);
  } catch (error) {
    const failure = error instanceof PdfProcessingError
      ? error
      : classifyPdfFailure(error);
    const status = failure.code === "pdf_page_limit_exceeded"
      ? 413
      : failure.code === "encrypted_pdf"
        ? 422
        : failure.code === "invalid_pdf"
          ? 400
          : 422;
    return Response.json({ error: failure.code }, { status });
  }

  const name = safePdfName(file.name);
  const documentId = createDocumentId();
  const createdAt = new Date().toISOString();
  const formattedSize = formatBytes(bytes.byteLength);
  const metadata: StoredOpsDocument = {
    id: documentId,
    name,
    type: "PDF importé",
    linked,
    owner: "Marie Delmas",
    updated: "À l’instant",
    status: "Importé",
    facts: pageCount,
    size: formattedSize,
    sizeBytes: bytes.byteLength,
    pages: pageCount,
    generated: false,
    url: `/api/documents/${documentId}`,
    downloadUrl: `/api/documents/${documentId}?download=1`,
    createdAt,
    sources: [documentId],
  };

  try {
    await persistDocument(metadata, bytes);
  } catch (error) {
    const code = error instanceof DocumentStorageError
      ? error.code
      : "document_storage_unavailable";
    return Response.json({ error: code }, { status: 503 });
  }

  try {
    await writeObsidianRecord({
      id: documentId,
      idPrefix: "DOC",
      folder: "08_Documents/Imports",
      type: "document",
      title: name.replace(/\.pdf$/i, ""),
      summary: extraction.hasSearchableText
        ? `PDF importé et indexé dans OPS : ${extraction.extractedCharacters.toLocaleString("fr-FR")} caractères extractibles, reliés à ${linked}.`
        : `PDF importé dans OPS et relié à ${linked}. Aucun texte extractible n’a été détecté ; aucun OCR n’a été exécuté.`,
      body: buildImportedPdfMemoryBody({
        documentId,
        name,
        size: formattedSize,
        pages: pageCount,
        linked,
        extraction,
      }),
      relations: [linked],
      attributes: {
        record_kind: "document",
        document_id: documentId,
        mime_type: "application/pdf",
        size_bytes: bytes.byteLength,
        pages: pageCount,
        status: "imported",
        text_characters: extraction.extractedCharacters,
        text_indexed: extraction.hasSearchableText,
        text_truncated: extraction.truncated,
        ocr_performed: false,
      },
      source: "Import utilisateur OPS",
    });
  } catch {
    let documentPersisted = true;
    try {
      await deleteDocument(documentId);
      documentPersisted = false;
    } catch {
      // L'erreur indique explicitement si une reprise de nettoyage est requise.
    }
    return Response.json(
      {
        error: "obsidian_memory_write_failed",
        documentId,
        documentPersisted,
      },
      { status: 503 },
    );
  }

  return Response.json(
    {
      document: metadata,
      extraction: {
        characters: extraction.extractedCharacters,
        searchable: extraction.hasSearchableText,
        truncated: extraction.truncated,
      },
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
