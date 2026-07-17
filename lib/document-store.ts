import "server-only";

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isStoredOpsDocument,
  type StoredOpsDocument,
} from "@/lib/ops-document";

const SAFE_DOCUMENT_ID = /^RAPPORT-[A-Z0-9-]{8,80}$/;

export class DocumentStorageError extends Error {
  constructor(
    public readonly code:
      | "document_storage_unavailable"
      | "document_metadata_invalid",
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "DocumentStorageError";
  }
}

function documentsRoot() {
  return path.resolve(
    process.env.OPS_DOCUMENTS_PATH?.trim()
      || path.join(os.tmpdir(), "ops-generated-documents"),
  );
}

function metadataPath(id: string) {
  return path.join(documentsRoot(), `${id}.json`);
}

function pdfPath(id: string) {
  return path.join(documentsRoot(), `${id}.pdf`);
}

export function createDocumentId() {
  const date = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date()).replaceAll("-", "");
  return `RAPPORT-${date}-${randomBytes(4).toString("hex").toLocaleUpperCase("en")}`;
}

export function isDocumentId(value: string) {
  return SAFE_DOCUMENT_ID.test(value);
}

export async function persistDocument(
  metadata: StoredOpsDocument,
  pdf: Uint8Array,
) {
  if (!isDocumentId(metadata.id)) {
    throw new DocumentStorageError("document_metadata_invalid");
  }
  const root = documentsRoot();
  const suffix = randomBytes(8).toString("hex");
  const temporaryPdf = path.join(root, `.${metadata.id}.${suffix}.pdf.tmp`);
  const temporaryMetadata = path.join(root, `.${metadata.id}.${suffix}.json.tmp`);
  const finalPdf = pdfPath(metadata.id);
  const finalMetadata = metadataPath(metadata.id);
  try {
    await fs.mkdir(root, { recursive: true, mode: 0o750 });
    await Promise.all([
      fs.writeFile(temporaryPdf, pdf, { mode: 0o640, flag: "wx" }),
      fs.writeFile(temporaryMetadata, JSON.stringify(metadata, null, 2), {
        encoding: "utf8",
        mode: 0o640,
        flag: "wx",
      }),
    ]);
    await fs.rename(temporaryPdf, finalPdf);
    try {
      await fs.rename(temporaryMetadata, finalMetadata);
    } catch (error) {
      await fs.rm(finalPdf, { force: true }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    await Promise.all([
      fs.rm(temporaryPdf, { force: true }).catch(() => undefined),
      fs.rm(temporaryMetadata, { force: true }).catch(() => undefined),
    ]);
    if (error instanceof DocumentStorageError) throw error;
    throw new DocumentStorageError("document_storage_unavailable", { cause: error });
  }
}

export async function deleteDocument(id: string) {
  if (!isDocumentId(id)) return;
  await Promise.all([
    fs.rm(pdfPath(id), { force: true }),
    fs.rm(metadataPath(id), { force: true }),
  ]);
}

export async function readDocumentMetadata(id: string) {
  if (!isDocumentId(id)) return null;
  try {
    const raw = await fs.readFile(metadataPath(id), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isStoredOpsDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readDocumentPdf(id: string) {
  if (!isDocumentId(id)) return null;
  try {
    return await fs.readFile(pdfPath(id));
  } catch {
    return null;
  }
}

export async function listDocuments(limit = 40) {
  const root = documentsRoot();
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }

  const documents = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .slice(0, 200)
      .map(async (name) => {
        try {
          const raw = await fs.readFile(path.join(root, name), "utf8");
          const parsed: unknown = JSON.parse(raw);
          return isStoredOpsDocument(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }),
  );

  return documents
    .filter((document): document is StoredOpsDocument => Boolean(document))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(100, limit)));
}
