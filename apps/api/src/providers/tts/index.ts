/**
 * Voces, efectos de sonido (y catálogo de voces) con ElevenLabs.
 * Mock: tonos con ffmpeg de duración proporcional al texto.
 */
import { writeFile } from "node:fs/promises";
import type { VoiceOptionDTO } from "@fruti/shared";
import { env } from "../../config";
import { ffmpeg, placeholderSpeech } from "../../lib/ffmpeg";
import { jsonFetch, ProviderError } from "../../lib/http";
import type { VoiceSettings } from "../../prompts/voice";

const EL = "https://api.elevenlabs.io/v1";

export interface SpeakInput {
  voiceId: string;
  text: string;
  settings: VoiceSettings;
  previousText?: string;
  nextText?: string;
  seed?: number;
  out: string;
}

export interface TtsProvider {
  speak(i: SpeakInput): Promise<string>;
  soundEffect(text: string, seconds: number, out: string): Promise<string>;
  listVoices(): Promise<VoiceOptionDTO[]>;
}

async function postAudio(url: string, body: unknown, out: string) {
  if (!env.ELEVENLABS_API_KEY) throw new ProviderError("ELEVENLABS_API_KEY no configurada", false);
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ProviderError(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status === 429 || res.status >= 500, res.status);
  }
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

const elevenlabs: TtsProvider = {
  speak(i) {
    const supportsLanguageCode = /v3|2_5|flash|turbo/.test(env.ELEVENLABS_MODEL);
    return postAudio(
      `${EL}/text-to-speech/${i.voiceId}?output_format=mp3_44100_128`,
      {
        text: i.text,
        model_id: env.ELEVENLABS_MODEL,
        ...(supportsLanguageCode ? { language_code: "es" } : {}),
        voice_settings: {
          stability: i.settings.stability,
          similarity_boost: i.settings.similarityBoost,
          style: i.settings.style,
          use_speaker_boost: true,
        },
        // Contexto de prosodia: la réplica suena como continuación natural de la escena
        previous_text: i.previousText,
        next_text: i.nextText,
        seed: i.seed,
      },
      i.out,
    );
  },
  soundEffect(text, seconds, out) {
    return postAudio(`${EL}/sound-generation`, { text, duration_seconds: Math.min(10, Math.max(0.5, seconds)), prompt_influence: 0.5 }, out);
  },
  async listVoices() {
    if (env.ELEVENLABS_VOICE_CATALOG) return parseCatalog(env.ELEVENLABS_VOICE_CATALOG);
    const r = await jsonFetch<{ voices: { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string }[] }>(`${EL}/voices`, {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY ?? "" },
    });
    return r.voices.map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels ?? {}, previewUrl: v.preview_url ?? null }));
  },
};

function parseCatalog(json: string): VoiceOptionDTO[] {
  const arr = JSON.parse(json) as { id: string; name: string; [k: string]: string }[];
  return arr.map(({ id, name, ...labels }) => ({ id, name, labels, previewUrl: null }));
}

// --------------------------------------------------------------------------- mock

const MOCK_VOICES: VoiceOptionDTO[] = [
  { id: "mock-fem-1", name: "Valentina (mock)", labels: { gender: "female", age: "young", accent: "mexican" }, previewUrl: null },
  { id: "mock-fem-2", name: "Doña Rosa (mock)", labels: { gender: "female", age: "old", accent: "colombian" }, previewUrl: null },
  { id: "mock-fem-3", name: "Camila (mock)", labels: { gender: "female", age: "middle aged", accent: "venezuelan" }, previewUrl: null },
  { id: "mock-masc-1", name: "Alejandro (mock)", labels: { gender: "male", age: "young", accent: "mexican" }, previewUrl: null },
  { id: "mock-masc-2", name: "Don Fermín (mock)", labels: { gender: "male", age: "old", accent: "colombian" }, previewUrl: null },
  { id: "mock-masc-3", name: "Panchito (mock)", labels: { gender: "male", age: "middle aged", accent: "caribbean" }, previewUrl: null },
];

const mock: TtsProvider = {
  speak(i) {
    const n = [...i.voiceId].reduce((a, c) => a + c.charCodeAt(0), 0);
    return placeholderSpeech(i.out, i.text, 180 + (n % 8) * 40);
  },
  async soundEffect(_text, seconds, out) {
    await ffmpeg(["-f", "lavfi", "-i", `anoisesrc=d=${Math.min(seconds, 1.5)}:c=pink:a=0.2`, "-af", "afade=t=out:st=0.3:d=1", out]);
    return out;
  },
  async listVoices() {
    return MOCK_VOICES;
  },
};

export const ttsProvider: TtsProvider = env.TTS_PROVIDER === "elevenlabs" ? elevenlabs : mock;
