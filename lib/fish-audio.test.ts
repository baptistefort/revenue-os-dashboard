import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanSpeechInput,
  createFishAudioPayload,
  DEFAULT_FISH_AUDIO_LATENCY,
  DEFAULT_FISH_AUDIO_MODEL,
  resolveFishAudioLatency,
  resolveFishAudioModel,
} from "./fish-audio";

test("nettoie le texte avant synthèse sans conserver les sources ni les URLs", () => {
  const input = cleanSpeechInput(
    "**Décision** [ouvrir](https://example.com) VAL-061 https://ops.example/rapport",
  );

  assert.equal(input, "Décision ouvrir");
});

test("construit une requête Fish Audio avec la voix et la prosodie attendues", () => {
  const payload = createFishAudioPayload(
    "Bonjour Marie.",
    "e11e47c85dc7449a9ce30c0993f87f91",
    "low",
  );

  assert.equal(payload.reference_id, "e11e47c85dc7449a9ce30c0993f87f91");
  assert.equal(payload.format, "mp3");
  assert.equal(payload.latency, "low");
  assert.equal(payload.chunk_length, 100);
  assert.equal(payload.prosody.normalize_loudness, true);
});

test("refuse les modèles et niveaux de latence inconnus", () => {
  assert.equal(resolveFishAudioModel("modèle-inventé"), DEFAULT_FISH_AUDIO_MODEL);
  assert.equal(resolveFishAudioLatency("instantané"), DEFAULT_FISH_AUDIO_LATENCY);
  assert.equal(DEFAULT_FISH_AUDIO_LATENCY, "low");
  assert.equal(resolveFishAudioModel("s2.1-pro"), "s2.1-pro");
});
