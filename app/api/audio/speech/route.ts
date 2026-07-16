import { guardPostRequest } from "@/lib/api-guard";
import {
  cleanSpeechInput,
  createFishAudioPayload,
  FISH_AUDIO_TTS_URL,
  resolveFishAudioModel,
} from "@/lib/fish-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SpeechProvider = "fish-audio" | "openai-fallback";

function audioResponse(upstream: Response, provider: SpeechProvider) {
  if (!upstream.body) return null;
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-OPS-TTS-Provider": provider,
    },
  });
}

async function fishAudioSpeech(input: string, signal: AbortSignal) {
  const apiKey = process.env.FISH_AUDIO_API_KEY?.trim();
  const referenceId = process.env.FISH_AUDIO_REFERENCE_ID?.trim();
  if (!apiKey || !referenceId) return null;

  const upstream = await fetch(FISH_AUDIO_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: resolveFishAudioModel(process.env.FISH_AUDIO_MODEL),
    },
    body: JSON.stringify(
      createFishAudioPayload(
        input,
        referenceId,
        process.env.FISH_AUDIO_LATENCY,
      ),
    ),
    cache: "no-store",
    signal,
  });

  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    return null;
  }

  return audioResponse(upstream, "fish-audio");
}

async function openAiSpeechFallback(input: string, signal: AbortSignal) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

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
    signal,
  });

  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    return null;
  }

  return audioResponse(upstream, "openai-fallback");
}

export async function POST(request: Request) {
  const blocked = guardPostRequest(request, "audio-speech", 20);
  if (blocked) return blocked;

  const payload = await request.json().catch(() => null) as { text?: unknown } | null;
  const input = cleanSpeechInput(payload?.text);
  if (!input) return Response.json({ error: "speech_text_required" }, { status: 400 });

  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(45_000),
  ]);

  try {
    const fishAudio = await fishAudioSpeech(input, signal);
    if (fishAudio) return fishAudio;

    const openAiFallback = await openAiSpeechFallback(input, signal);
    if (openAiFallback) return openAiFallback;

    return Response.json(
      {
        configured: false,
        error: "audio_speech_not_configured",
        retryable: true,
      },
      { status: 503 },
    );
  } catch {
    return Response.json(
      { error: "audio_speech_upstream_unavailable", retryable: true },
      { status: 503 },
    );
  }
}
