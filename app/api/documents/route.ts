import { listDocuments } from "@/lib/document-store";
import { buildObsidianVaultIndex } from "@/lib/obsidian-vault-memory";
import { resolveOpsDemoVaultRoot } from "@/lib/obsidian-write";
import {
  catalogVaultDocuments,
  mergeDocumentListings,
} from "@/lib/vault-document-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(250, Math.round(requestedLimit)))
    : 100;
  const stored = await listDocuments(Math.min(limit, 100));
  let vaultDocuments = [] as ReturnType<typeof catalogVaultDocuments>;
  try {
    const root = await resolveOpsDemoVaultRoot();
    vaultDocuments = catalogVaultDocuments(await buildObsidianVaultIndex(root));
  } catch {
    // A transient Obsidian mount failure must not hide PDFs already persisted.
  }
  const allDocuments = mergeDocumentListings(stored, vaultDocuments, 250);
  return Response.json(
    {
      documents: allDocuments.slice(0, limit),
      counts: {
        total: allDocuments.length,
        pdf: stored.length,
        obsidian: vaultDocuments.length,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
