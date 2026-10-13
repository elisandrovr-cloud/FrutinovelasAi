/**
 * SISTEMA DE CONTINUIDAD
 *
 * Seis capas que se combinan en cada plano (detalle en docs/03-CONTINUIDAD.md):
 *  1. Style lock   — mismo texto de estilo en cada prompt (VISUAL_STYLE_LOCK)
 *  2. ADN          — descripción congelada del personaje (CharacterVersion.dnaPrompt)
 *  3. Ancla visual — imagen de referencia del personaje + del escenario como inputs
 *  4. Semillas     — derivadas de la semilla maestra (personaje, escenario, plano)
 *  5. Encadenado   — el primer plano del capítulo N parte del último fotograma del N-1;
 *                    dentro de una escena cada plano parte de la imagen clave anterior
 *  6. Estado       — endState del guion (dónde está cada quien, cómo se siente) inyectado
 *                    en el guion del siguiente capítulo y en la imagen clave inicial
 */
import type { BibleCharacter, ChapterScript, Scene, Shot } from "@fruti/shared";
import { prisma } from "../lib/db";
import { deriveSeed } from "../lib/seed";
import { keyframePrompt, type CastRef } from "../prompts/video";
import type { VoiceSettings } from "../prompts/voice";
import { versionForChapter } from "./characters";

export interface CastMember {
  key: string;
  name: string;
  dna: string;
  referenceKey: string;
  voiceId: string;
  voiceSettings: VoiceSettings;
  seed: number;
  bible: BibleCharacter;
}

/** Resuelve la versión de cada personaje vigente en el capítulo (soporta cambios a mitad). */
export async function castForChapter(novelaId: string, chapter: number): Promise<Map<string, CastMember>> {
  const characters = await prisma.character.findMany({ where: { novelaId }, include: { versions: true } });
  const cast = new Map<string, CastMember>();
  for (const c of characters) {
    const v = versionForChapter(c.versions, chapter);
    if (!v || !v.referenceImageKey || !v.voiceId) throw new Error(`El personaje ${c.name} no tiene diseño listo para el capítulo ${chapter}`);
    cast.set(c.key, {
      key: c.key,
      name: c.name,
      dna: v.dnaPrompt,
      referenceKey: v.referenceImageKey,
      voiceId: v.voiceId,
      voiceSettings: v.voiceSettings as unknown as VoiceSettings,
      seed: v.seed,
      bible: c.bible as unknown as BibleCharacter,
    });
  }
  return cast;
}

export interface ContinuityAnchor {
  imageKey: string;
  note: string;
}

/** Ancla entre capítulos: último fotograma + descripción del estado final del capítulo previo. */
export async function previousChapterAnchor(novelaId: string, chapter: number): Promise<ContinuityAnchor | null> {
  if (chapter <= 1) return null;
  const prev = await prisma.chapter.findUnique({ where: { novelaId_number: { novelaId, number: chapter - 1 } } });
  if (!prev?.lastFrameKey) throw new Error(`Falta el último fotograma del capítulo ${chapter - 1}: genera los capítulos en orden`);
  const script = prev.script as unknown as ChapterScript | null;
  const note = script
    ? `Previous chapter ended on: ${script.endState.lastFrame}. ` +
      script.endState.characters.map((c) => `${c.characterKey.toUpperCase()}: ${c.physicalState}`).join("; ")
    : "";
  return { imageKey: prev.lastFrameKey, note };
}

/** Máximo de imágenes de referencia que admite bien el modelo de edición multi-imagen. */
const MAX_REFS = 4;

/**
 * Decide qué imágenes entran como referencia de la imagen clave y en qué orden, y
 * construye el prompt citando cada imagen por su índice.
 */
export function planKeyframe(p: {
  scene: Scene;
  shot: Shot;
  setName: string;
  setPrompt: string;
  setRefKey: string | null;
  cast: Map<string, CastMember>;
  continuityKey: string | null;
  continuityNote: string | null;
}) {
  const images: string[] = [];
  const onScreen = p.shot.charactersOnScreen.map((k) => p.cast.get(k)).filter((c): c is CastMember => !!c);

  // Prioridad: continuidad > personajes > escenario (el escenario también va descrito en texto)
  let continuityIdx: number | null = null;
  if (p.continuityKey) {
    images.push(p.continuityKey);
    continuityIdx = images.length;
  }
  const castRefs: CastRef[] = [];
  for (const c of onScreen) {
    if (images.length >= MAX_REFS) break;
    images.push(c.referenceKey);
    castRefs.push({ key: c.key, dna: c.dna, imageIndex: images.length });
  }
  let setIdx: number | null = null;
  if (p.setRefKey && images.length < MAX_REFS && !p.continuityKey) {
    images.push(p.setRefKey);
    setIdx = images.length;
  }

  const prompt = keyframePrompt({
    scene: p.scene,
    shot: p.shot,
    setName: p.setName,
    setPromptEn: p.setPrompt,
    setImageIndex: setIdx,
    cast: castRefs,
    continuityFromImageIndex: continuityIdx,
    continuityNote: p.continuityNote,
  });
  return { imageKeys: images, prompt };
}

export function shotSeed(masterSeed: number, chapter: number, order: number) {
  return deriveSeed(masterSeed, "shot", chapter, order);
}
