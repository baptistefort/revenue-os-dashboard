import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCentralMemoryPool } from "@/lib/central-memory/database";
import {
  authorizeConnectorIngestion,
  ConnectorKnowledgeIngestionService,
  parseConnectorKnowledgeEvent,
} from "@/lib/central-memory/connector-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function tenantHeader(request: Request) {
  return request.headers.get("x-ops-tenant")?.trim() ?? "";
}

function unauthorized(reason: string, status = 401) {
  return NextResponse.json(
    { error: "connector_unauthorized", reason },
    { status, headers: NO_STORE_HEADERS },
  );
}

function validateAuthorization(request: Request, tenantId: string) {
  if (!tenantId || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) {
    return unauthorized("tenant_header_required", 400);
  }
  const authorization = authorizeConnectorIngestion(
    request.headers.get("authorization"),
    tenantId,
  );
  if (!authorization.authorized) {
    return unauthorized(
      authorization.reason === "unconfigured" ? "connector_auth_unavailable" : "invalid_credentials",
      authorization.reason === "unconfigured" ? 503 : 401,
    );
  }
  return null;
}

function safeConnectorId(value: string | null, fallback: string) {
  const candidate = value?.trim();
  return candidate && /^[a-zA-Z0-9._:@/-]{1,256}$/.test(candidate) ? candidate : fallback;
}

export async function POST(request: Request) {
  const tenantId = tenantHeader(request);
  const blocked = validateAuthorization(request, tenantId);
  if (blocked) return blocked;

  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "connector_event_too_large" },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const event = parseConnectorKnowledgeEvent(body);
    if (event.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "cross_tenant_event_rejected" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }
    const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
    const correlationId = request.headers.get("x-correlation-id")?.trim() || requestId;
    const service = new ConnectorKnowledgeIngestionService(getCentralMemoryPool());
    const result = await service.ingest(event, {
      actorId: safeConnectorId(
        request.headers.get("x-ops-connector-id"),
        `${event.source}:${event.sourceAccountId}`,
      ),
      requestId,
      correlationId,
    });
    return NextResponse.json(
      { accepted: true, ...result },
      {
        status: result.duplicate || result.stale ? 200 : 202,
        headers: { ...NO_STORE_HEADERS, "X-Request-Id": requestId },
      },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "invalid_connector_event",
          issues: error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "connector_event_too_large") {
      return NextResponse.json(
        { error: message },
        { status: 413, headers: NO_STORE_HEADERS },
      );
    }
    if (message.startsWith("unknown_entity_ref") || message === "duplicate_entity_ref") {
      return NextResponse.json(
        { error: "invalid_knowledge_references", detail: message },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }
    if (message === "organization_not_found") {
      return NextResponse.json(
        { error: message },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    console.error("connector ingestion failed", {
      error: message || "unknown_error",
      tenantId,
    });
    return NextResponse.json(
      { error: "connector_ingestion_failed" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

export async function GET(request: Request) {
  const tenantId = tenantHeader(request);
  const blocked = validateAuthorization(request, tenantId);
  if (blocked) return blocked;
  try {
    const service = new ConnectorKnowledgeIngestionService(getCentralMemoryPool());
    const stats = await service.stats(tenantId);
    return NextResponse.json(
      { status: "ok", ingestion: stats },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: message === "organization_not_found" ? message : "connector_ingestion_unavailable" },
      { status: message === "organization_not_found" ? 404 : 503, headers: NO_STORE_HEADERS },
    );
  }
}
