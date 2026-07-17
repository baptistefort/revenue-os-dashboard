import type {
  ObsidianFrontmatterValue,
  ObsidianMemoryRecord,
  ObsidianVaultIndex,
} from "@/lib/obsidian-vault-memory";
import type { ListedOpsDocument, StoredOpsDocument } from "@/lib/ops-document";

const PERSON_TYPES = new Set(["person", "people"]);
const DOCUMENT_ROOTS = [
  "01_Raw/",
  "04_Conversations/Reunions/",
  "07_Finance/Factures/",
  "07_Finance/Rentabilite/",
  "08_Documents/",
  "11_Wiki/",
  "12_Syntheses/",
];

function scalar(value: ObsidianFrontmatterValue | undefined) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function normalized(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function idOfRelation(value: string) {
  return value
    .replace(/\.md$/i, "")
    .split(" — ", 1)[0]
    .trim();
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR")} Ko`;
  return `${bytes.toLocaleString("fr-FR")} o`;
}

function safeIso(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(parsed).toISOString()
    : new Date(0).toISOString();
}

function formatUpdated(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(parsed)).replace(",", " ·");
}

function isVaultDocument(record: ObsidianMemoryRecord) {
  if (DOCUMENT_ROOTS.some((root) => record.path.startsWith(root))) return true;
  const id = normalized(record.id);
  return record.path.startsWith("02_Direction/Decisions-et-alertes/")
    && (id.startsWith("strat ") || normalized(record.title).includes("strategie"));
}

function documentType(record: ObsidianMemoryRecord) {
  const id = normalized(record.id);
  const title = normalized(record.title);
  const joined = `${id} ${title} ${normalized(record.path)}`;
  const status = normalized(scalar(record.attributes.status));
  const mime = normalized(scalar(record.attributes.mime_type));

  if (mime === "application pdf" && status === "imported") return "PDF importé";
  if (mime === "application pdf" && status === "generated") return "Rapport PDF";
  if (id.startsWith("fact ")) return "Facture";
  if (id.startsWith("dev ")) return "Devis";
  if (id.startsWith("contrat ")) return "Contrat";
  if (id.startsWith("bdc ")) return "Bon de commande";
  if (id.startsWith("proc ")) return "Procédure";
  if (id.startsWith("plan ")) return "Plan";
  if (/^(call|meet|cr)\b/.test(id)) return "Réunion";
  if (id.startsWith("analysis ")) return "Analyse IA";
  if (id.startsWith("brief ")) return "Brief";
  if (id.startsWith("synth ") || id.startsWith("wiki ")) return "Synthèse";
  if (id.startsWith("strat ") || title.includes("strategie")) return "Stratégie";
  if (/^(seo|geo)\b/.test(id) || joined.includes(" seo ")) return "Rapport SEO & GEO";
  if (/^(gads|meta|ig|acq|linkedin|web)\b/.test(id)) return "Rapport acquisition";
  if (id.startsWith("fin ")) return "Rapport financier";
  if (id.startsWith("crm ")) return "Rapport commercial";
  if (id.startsWith("ops ")) return "Rapport opérations";
  if (/^(hr|people)\b/.test(id)) return "Rapport RH";
  if (/^(legal|rgpd)\b/.test(id)) return "Rapport conformité";
  if (/^(procurement|stock|asset)\b/.test(id)) return "Rapport exploitation";
  if (id.startsWith("cx ")) return "Rapport client";
  if (id.startsWith("mail digest ")) return "Synthèse emails";
  return "Document Obsidian";
}

function documentStatus(record: ObsidianMemoryRecord) {
  const status = normalized(scalar(record.attributes.status));
  if (status === "generated") return "Généré";
  if (status === "imported") return "Importé";
  if (status === "maintained") return "Maintenu";
  if (record.type === "analysis") return "Produit par OPS";
  return "Indexé";
}

function relatedRecord(
  index: ObsidianVaultIndex,
  record: ObsidianMemoryRecord,
  predicate: (candidate: ObsidianMemoryRecord) => boolean,
) {
  const relations = new Set(record.relations.map(idOfRelation));
  return index.records.find((candidate) => (
    candidate.id !== record.id
    && relations.has(candidate.id)
    && predicate(candidate)
  ));
}

function documentOwner(index: ObsidianVaultIndex, record: ObsidianMemoryRecord) {
  for (const key of ["owner", "responsable", "responsible", "actor", "created_by"]) {
    const value = scalar(record.attributes[key]);
    if (value) return value;
  }
  const person = relatedRecord(index, record, (candidate) => PERSON_TYPES.has(normalized(candidate.type)));
  if (person) return person.title;
  if (/^(07_Finance|01_Raw\/Finance)/.test(record.path)) return "Inès Martin";
  if (/^(01_Raw\/Marketing|09_Marketing)/.test(record.path)) return "Camille Laurent";
  if (/^(06_Operations|01_Raw\/Operations)/.test(record.path)) return "Hugo Bernard";
  return "OPS";
}

function documentLinked(index: ObsidianVaultIndex, record: ObsidianMemoryRecord) {
  for (const key of ["linked", "linked_to", "project", "client", "account"]) {
    const value = scalar(record.attributes[key]);
    if (value) return value;
  }
  const related = relatedRecord(index, record, (candidate) => (
    !PERSON_TYPES.has(normalized(candidate.type))
    && normalized(candidate.type) !== "company"
    && !candidate.id.startsWith("ORG-")
  ));
  if (related) return related.title;
  if (record.path.startsWith("01_Raw/Marketing/")) return "Acquisition & visibilité";
  if (record.path.startsWith("01_Raw/Finance/")) return "Direction financière";
  if (record.path.startsWith("11_Wiki/") || record.path.startsWith("12_Syntheses/")) return "Direction";
  return "Mémoire d’entreprise";
}

function storageId(record: ObsidianMemoryRecord) {
  return scalar(record.attributes.document_id) || record.id;
}

export function catalogVaultDocuments(index: ObsidianVaultIndex): ListedOpsDocument[] {
  return index.records
    .filter(isVaultDocument)
    .map((record) => {
      const sizeBytes = Buffer.byteLength(record.content, "utf8");
      const createdAt = safeIso(record.updatedAt);
      const id = storageId(record);
      const pages = Number(record.attributes.pages);
      const sourceCount = Number(record.attributes.source_count);
      return {
        id,
        name: record.title,
        type: documentType(record),
        linked: documentLinked(index, record),
        owner: documentOwner(index, record),
        updated: formatUpdated(record.updatedAt),
        status: documentStatus(record),
        facts: Number.isFinite(sourceCount) && sourceCount > 0
          ? Math.round(sourceCount)
          : Math.max(1, record.facts.length),
        size: formatSize(sizeBytes),
        sizeBytes,
        pages: Number.isFinite(pages) && pages > 0 ? Math.round(pages) : 0,
        generated: normalized(scalar(record.attributes.status)) === "generated",
        url: "",
        downloadUrl: "",
        createdAt,
        sources: record.relations.map(idOfRelation).filter(Boolean),
        sourceKind: "obsidian" as const,
        vaultPath: record.path,
        summary: record.summary,
      };
    })
    .sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt)
      || left.name.localeCompare(right.name, "fr")
    ));
}

export function mergeDocumentListings(
  stored: StoredOpsDocument[],
  vault: ListedOpsDocument[],
  limit = 100,
) {
  const merged = new Map<string, ListedOpsDocument>();
  for (const document of vault) merged.set(document.id, document);
  for (const document of stored) {
    const vaultDocument = merged.get(document.id);
    merged.set(document.id, {
      ...vaultDocument,
      ...document,
      linked: vaultDocument?.linked || document.linked,
      owner: vaultDocument?.owner || document.owner,
      facts: Math.max(document.facts, vaultDocument?.facts ?? 0),
      sources: [...new Set([...document.sources, ...(vaultDocument?.sources ?? [])])],
      sourceKind: "pdf",
      vaultPath: vaultDocument?.vaultPath,
      summary: vaultDocument?.summary,
    });
  }
  return [...merged.values()]
    .sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt)
      || left.name.localeCompare(right.name, "fr")
    ))
    .slice(0, Math.max(1, Math.min(250, limit)));
}
