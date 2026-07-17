import { NextResponse } from "next/server";
import { getOpsReadiness } from "@/lib/ops-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const readiness = await getOpsReadiness();
  return NextResponse.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
