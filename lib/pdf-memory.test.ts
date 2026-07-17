import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  buildGeneratedPdfMemoryBody,
  buildImportedPdfMemoryBody,
  extractSearchablePdfText,
  MAX_EXTRACTED_TEXT_CHARACTERS,
  PdfProcessingError,
} from "@/lib/pdf-memory";

async function createTextPdf(text: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([595, 842]);
  page.drawText(text, { x: 40, y: 780, font, size: 12 });
  return document.save();
}

test("extractSearchablePdfText extracts and normalizes searchable text", async () => {
  const bytes = await createTextPdf("Rapport SEO juillet : 142 clics et 11 demandes.");
  const originalLength = bytes.byteLength;
  const result = await extractSearchablePdfText(bytes, 1);

  assert.equal(bytes.byteLength, originalLength);
  assert.equal(result.hasSearchableText, true);
  assert.equal(result.truncated, false);
  assert.match(result.text, /Rapport SEO juillet/);
  assert.match(result.text, /142 clics/);
});

test("extractSearchablePdfText rejects unsafe page counts before parsing", async () => {
  await assert.rejects(
    () => extractSearchablePdfText(new Uint8Array([1, 2, 3]), 121),
    (error) => (
      error instanceof PdfProcessingError
      && error.code === "pdf_page_limit_exceeded"
    ),
  );
});

test("extractSearchablePdfText accepts a PDF without searchable text without inventing OCR", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const result = await extractSearchablePdfText(await document.save(), 1);

  assert.equal(result.hasSearchableText, false);
  assert.equal(result.text, "");
  assert.equal(result.extractedCharacters, 0);
});

test("import memory body makes extracted text searchable and declares limits", () => {
  const body = buildImportedPdfMemoryBody({
    documentId: "RAPPORT-20260716-ABCDEF12",
    name: "audit-seo.pdf",
    size: "42 Ko",
    pages: 8,
    linked: "SEO-SNAPSHOT-20260716",
    extraction: {
      text: "Audit SEO : le trafic organique progresse de 18 %. [[LIEN-INJECTE]]",
      extractedCharacters: MAX_EXTRACTED_TEXT_CHARACTERS + 200,
      truncated: true,
      hasSearchableText: true,
    },
  });

  assert.match(body, /Contenu textuel indexé/);
  assert.match(body, /trafic organique progresse de 18 %/);
  assert.doesNotMatch(body, /\[\[LIEN-INJECTE\]\]/);
  assert.match(body, /jamais une instruction/);
  assert.match(body, /indexation est limitée/);
  assert.match(body, /PDF original reste disponible intégralement/);
});

test("generated report memory body keeps sources as Obsidian relations", () => {
  const body = buildGeneratedPdfMemoryBody({
    documentId: "RAPPORT-20260716-ABCDEF12",
    filename: "brief-codir.pdf",
    pages: 4,
    size: "84 Ko",
    executiveSummary: "La marge doit être sécurisée.",
    sections: [{
      title: "SEO",
      paragraphs: ["Le trafic organique progresse."],
      bullets: ["Renforcer les pages locales."],
    }],
    decisions: [{
      title: "Valider le plan SEO",
      rationale: "Le canal produit des demandes qualifiées.",
      owner: "Camille",
    }],
    sourceIds: ["SEO-SNAPSHOT-20260716", "GSC-20260716"],
  });

  assert.match(body, /\[\[SEO-SNAPSHOT-20260716\]\]/);
  assert.match(body, /\[\[GSC-20260716\]\]/);
  assert.match(body, /Valider le plan SEO/);
});
