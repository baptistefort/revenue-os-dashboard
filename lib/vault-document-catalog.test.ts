import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ObsidianMemoryRecord, ObsidianVaultIndex } from "@/lib/obsidian-vault-memory";
import type { StoredOpsDocument } from "@/lib/ops-document";
import {
  catalogVaultDocuments,
  mergeDocumentListings,
} from "@/lib/vault-document-catalog";

function record(input: Partial<ObsidianMemoryRecord> & Pick<ObsidianMemoryRecord, "id" | "title" | "type" | "path">): ObsidianMemoryRecord {
  return {
    summary: `${input.title} résumé`,
    facts: ["fait 1", "fait 2"],
    relations: [],
    aliases: [],
    updatedAt: "2026-07-16T08:00:00+02:00",
    source: "test",
    attributes: {},
    content: `# ${input.title}\n\nContenu documenté.`,
    ...input,
  };
}

function index(records: ObsidianMemoryRecord[]): ObsidianVaultIndex {
  return {
    root: "/vault",
    records,
    scannedFiles: records.length,
    scannedBytes: 1_024,
    truncated: false,
    indexedAt: "2026-07-16T10:00:00.000Z",
  };
}

describe("vault document catalog", () => {
  it("lists real reports and business documents but excludes CRM entities and emails", () => {
    const person = record({ id: "PER-002", title: "Camille Laurent", type: "person", path: "02_Direction/Equipe/PER-002.md" });
    const client = record({ id: "CLI-001", title: "Rivoli", type: "client", path: "03_CRM/Clients/CLI-001.md" });
    const email = record({ id: "EMAIL-901", title: "Facture de juin", type: "document", path: "04_Conversations/Emails/EMAIL-901.md" });
    const seo = record({ id: "SEO-SNAPSHOT-20260716", title: "SEO quotidien", type: "marketing", path: "01_Raw/Marketing/SEO/SEO-SNAPSHOT-20260716.md" });
    const contract = record({
      id: "CONTRAT-241",
      title: "Contrat Rivoli signé",
      type: "document",
      path: "08_Documents/CONTRAT-241.md",
      relations: ["CLI-001 — Rivoli", "PER-002 — Camille Laurent"],
    });
    const documents = catalogVaultDocuments(index([person, client, email, seo, contract]));

    assert.deepEqual(documents.map((document) => document.id).sort(), ["CONTRAT-241", "SEO-SNAPSHOT-20260716"]);
    assert.equal(documents.find((document) => document.id === "CONTRAT-241")?.type, "Contrat");
    assert.equal(documents.find((document) => document.id === "CONTRAT-241")?.linked, "Rivoli");
    assert.equal(documents.find((document) => document.id === "CONTRAT-241")?.owner, "Camille Laurent");
    assert.equal(documents.find((document) => document.id === "SEO-SNAPSHOT-20260716")?.type, "Rapport SEO & GEO");
  });

  it("uses document_id as the stable key and exposes Obsidian provenance", () => {
    const imported = record({
      id: "DOC-LOCAL-01",
      title: "Audit SEO importé",
      type: "document",
      path: "08_Documents/Imports/DOC-LOCAL-01.md",
      attributes: {
        document_id: "RAPPORT-20260716-ABC123",
        mime_type: "application/pdf",
        status: "imported",
        pages: 6,
      },
    });
    const [document] = catalogVaultDocuments(index([imported]));
    assert.equal(document.id, "RAPPORT-20260716-ABC123");
    assert.equal(document.type, "PDF importé");
    assert.equal(document.status, "Importé");
    assert.equal(document.pages, 6);
    assert.equal(document.sourceKind, "obsidian");
    assert.equal(document.vaultPath, imported.path);
  });

  it("deduplicates a PDF and its vault memory note while preserving the downloadable artifact", () => {
    const vault = catalogVaultDocuments(index([record({
      id: "RAPPORT-20260716-ABC123",
      title: "Brief CODIR",
      type: "document",
      path: "08_Documents/Rapports/RAPPORT-20260716-ABC123.md",
      relations: ["STRAT-2026-Q3 — Stratégie"],
      attributes: {
        document_id: "RAPPORT-20260716-ABC123",
        mime_type: "application/pdf",
        status: "generated",
      },
    })]));
    const stored: StoredOpsDocument = {
      id: "RAPPORT-20260716-ABC123",
      name: "Brief CODIR.pdf",
      type: "Rapport PDF",
      linked: "Direction",
      owner: "OPS",
      updated: "16 juil. · 10:00",
      status: "Généré",
      facts: 8,
      size: "12 Ko",
      sizeBytes: 12_288,
      pages: 4,
      generated: true,
      url: "/api/documents/RAPPORT-20260716-ABC123",
      downloadUrl: "/api/documents/RAPPORT-20260716-ABC123?download=1",
      createdAt: "2026-07-16T10:00:00.000Z",
      sources: ["STRAT-2026-Q3"],
    };
    const merged = mergeDocumentListings([stored], vault);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].sourceKind, "pdf");
    assert.equal(merged[0].url, stored.url);
    assert.equal(merged[0].vaultPath, vault[0].vaultPath);
  });
});
