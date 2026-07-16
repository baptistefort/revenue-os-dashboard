export const FISH_AUDIO_TTS_URL = "https://api.fish.audio/v1/tts";
export const DEFAULT_FISH_AUDIO_MODEL = "s2.1-pro";
export const DEFAULT_FISH_AUDIO_LATENCY = "low";
export const MAX_SPEECH_CHARACTERS = 4_000;

const FISH_AUDIO_MODELS = new Set([
  "s1",
  "s2-pro",
  "s2.1-pro",
  "s2.1-pro-free",
]);

const FISH_AUDIO_LATENCIES = new Set([
  "low",
  "balanced",
  "normal",
]);

export function cleanSpeechInput(value: unknown) {
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

export function resolveFishAudioModel(value: string | undefined) {
  const candidate = value?.trim();
  return candidate && FISH_AUDIO_MODELS.has(candidate)
    ? candidate
    : DEFAULT_FISH_AUDIO_MODEL;
}

export function resolveFishAudioLatency(value: string | undefined) {
  const candidate = value?.trim();
  return candidate && FISH_AUDIO_LATENCIES.has(candidate)
    ? candidate
    : DEFAULT_FISH_AUDIO_LATENCY;
}

export function createFishAudioPayload(
  text: string,
  referenceId: string,
  latency = DEFAULT_FISH_AUDIO_LATENCY,
) {
  return {
    text,
    reference_id: referenceId,
    format: "mp3",
    sample_rate: 44_100,
    mp3_bitrate: 128,
    latency: resolveFishAudioLatency(latency),
    normalize: true,
    temperature: 0.7,
    top_p: 0.7,
    chunk_length: 100,
    prosody: {
      speed: 1,
      volume: 0,
      normalize_loudness: true,
    },
    repetition_penalty: 1.2,
    min_chunk_length: 50,
    condition_on_previous_chunks: true,
  };
}
