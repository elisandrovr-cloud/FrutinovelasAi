/**
 * PROMPTS / AJUSTES DE VOZ (ElevenLabs)
 *
 * - Cada personaje tiene una voz fija (voiceId) + ajustes base guardados en su versión.
 * - Por réplica se modulan stability/style según la entrega (susurro, grito, sollozo...).
 * - previous_text / next_text dan contexto de prosodia entre réplicas consecutivas.
 * - Con eleven_v3 se añaden audio tags ([whispers], [sobbing]...) que el modelo interpreta.
 * - Seed estable por personaje para que la misma línea suene igual al regenerar.
 */
import type { DialogueLine } from "@fruti/shared";

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { stability: 0.4, similarityBoost: 0.8, style: 0.45 };

const DELIVERY: Record<DialogueLine["delivery"], { stabilityDelta: number; styleDelta: number; tag: string | null }> = {
  normal: { stabilityDelta: 0, styleDelta: 0, tag: null },
  susurro: { stabilityDelta: 0.15, styleDelta: -0.1, tag: "[whispers]" },
  grito: { stabilityDelta: -0.2, styleDelta: 0.35, tag: "[shouting]" },
  sollozo: { stabilityDelta: -0.25, styleDelta: 0.3, tag: "[sobbing]" },
  risa: { stabilityDelta: -0.15, styleDelta: 0.25, tag: "[laughs]" },
  sarcastico: { stabilityDelta: -0.05, styleDelta: 0.2, tag: "[sarcastic]" },
  seductor: { stabilityDelta: 0.05, styleDelta: 0.2, tag: "[seductively]" },
  temblorosa: { stabilityDelta: -0.2, styleDelta: 0.2, tag: "[trembling voice]" },
  solemne: { stabilityDelta: 0.15, styleDelta: 0.1, tag: "[solemnly]" },
};

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function settingsForLine(base: VoiceSettings, line: DialogueLine): VoiceSettings {
  const d = DELIVERY[line.delivery] ?? DELIVERY.normal;
  return {
    stability: clamp(base.stability + d.stabilityDelta),
    similarityBoost: base.similarityBoost,
    style: clamp(base.style + d.styleDelta),
  };
}

/**
 * Prepara el texto para TTS: en v3 antepone el audio tag; en v2 refuerza la
 * entrega con puntuación (el modelo multilingüe es muy sensible a "...", "¡!" y mayúsculas).
 */
export function ttsText(line: DialogueLine, model: string) {
  const text = line.text.trim();
  if (model.includes("v3")) {
    const tag = DELIVERY[line.delivery]?.tag;
    return tag ? `${tag} ${text}` : text;
  }
  switch (line.delivery) {
    case "grito":
      return /[!¡]/.test(text) ? text : `¡${text.replace(/[.]$/, "")}!`;
    case "susurro":
    case "temblorosa":
      return text.replace(/([,.])\s/g, "$1.. ");
    default:
      return text;
  }
}

/** Texto de prueba para escuchar la voz al aprobar el personaje. */
export function voicePreviewText(name: string, catchphrase: string) {
  return `Soy ${name}... y que te quede claro: ${catchphrase}`;
}
