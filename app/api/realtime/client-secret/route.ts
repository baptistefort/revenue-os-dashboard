import { NextResponse } from "next/server";
import { guardPostRequest } from "@/lib/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = guardPostRequest(request, "realtime-secret", 8);
  if (blocked) return blocked;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        configured: false,
        error: "realtime_not_configured",
        fallback: "browser_voice",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "ops-demo-marie-delmas",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          audio: {
            output: { voice: "marin" },
          },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "realtime_upstream_unavailable", fallback: "browser_voice" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
