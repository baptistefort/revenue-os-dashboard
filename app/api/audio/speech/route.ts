import { guardPostRequest } from "@/lib/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SPEECH_CHARACTERS = 4_000;

function cleanSpeechInput(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>`~]/g, "")
    .replace(/\b[A-ZÀ-ÖØ-Þ]{2,}(?:-[A-ZÀ-ÖØ-Þ0-9]+)+\b/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_CHARACTERS);
}

export async function POST(request: Request) {
  const blocked = guardPostRequest(request, "audio-speech", 30);
  if (blocked) return blocked;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { configured: false, error: "audio_speech_not_configured" },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => null) as { text?: unknown } | null;
  const input = cleanSpeechInput(payload?.text);
  if (!input) return Response.json({ error: "speech_text_required" }, { status: 400 });

  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "ops-voice-marie-delmas",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
        voice: process.env.OPENAI_TTS_VOICE ?? "marin",
        input,
        instructions:
          "Voix française naturelle, posée et chaleureuse. Ton de copilote de direction senior. Débit fluide, phrases nettes, sans emphase publicitaire.",
        response_format: "mp3",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        {
          error: "audio_speech_failed",
          retryable: upstream.status === 408 || upstream.status === 429 || upstream.status >= 500,
        },
        { status: upstream.status === 401 || upstream.status === 403 ? 503 : upstream.status },
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "audio_speech_upstream_unavailable", retryable: true },
      { status: 503 },
    );
  }
}
