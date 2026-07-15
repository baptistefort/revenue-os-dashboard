import OpenAI from "openai";
import { NextResponse } from "next/server";
import { guardPostRequest } from "@/lib/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const blocked = guardPostRequest(request, "audio-transcription", 20);
  if (blocked) return blocked;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(
      {
        configured: false,
        error: "audio_transcription_not_configured",
        message: "Le moteur vocal serveur n’est pas encore configuré.",
      },
      503,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "invalid_multipart_body" }, 400);
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return json({ error: "audio_file_required" }, 400);
  }
  if (audio.size === 0) {
    return json({ error: "empty_audio_file" }, 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return json({ error: "audio_file_too_large", max_bytes: MAX_AUDIO_BYTES }, 413);
  }

  const normalizedType = audio.type.toLowerCase().split(";")[0];
  if (normalizedType && !ALLOWED_AUDIO_TYPES.has(normalizedType)) {
    return json({ error: "unsupported_audio_type", received: normalizedType }, 415);
  }

  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
  try {
    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
      language: "fr",
      response_format: "json",
      prompt:
        "Conversation de direction en français pour OPS et Atelier Beaumarchais. Préserver exactement les identifiants comme VAL-061, FACT-879, PROJET-241, les montants, les noms propres et la ponctuation.",
    });

    const text = transcription.text?.trim();
    if (!text) return json({ error: "empty_transcription" }, 422);

    return json({ configured: true, text }, 200);
  } catch (error) {
    const status = error instanceof OpenAI.APIError && error.status ? error.status : 502;
    const safeStatus = status === 401 || status === 403 ? 503 : status >= 400 && status < 600 ? status : 502;
    return json(
      {
        error: "audio_transcription_failed",
        retryable: safeStatus === 408 || safeStatus === 429 || safeStatus >= 500,
      },
      safeStatus,
    );
  }
}
