import "server-only";

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StoredOpsDocument } from "@/lib/ops-document";

const SAFE_DOCUMENT_ID = /^RAPPORT-[A-Z0-9-]{8,80}$/;

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
  if (!isDocumentId(metadata.id)) throw new Error("invalid_document_id");
  const root = documentsRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o750 });
  await fs.writeFile(pdfPath(metadata.id), pdf, { mode: 0o640 });
  await fs.writeFile(metadataPath(metadata.id), JSON.stringify(metadata, null, 2), {
    encoding: "utf8",
    mode: 0o640,
  });
}

export async function readDocumentMetadata(id: string) {
  if (!isDocumentId(id)) return null;
  try {
    const raw = await fs.readFile(metadataPath(id), "utf8");
    return JSON.parse(raw) as StoredOpsDocument;
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
          return JSON.parse(raw) as StoredOpsDocument;
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
