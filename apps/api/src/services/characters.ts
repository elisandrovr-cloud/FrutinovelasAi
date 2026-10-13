/**
 * Diseño de personajes como assets reutilizables + versionado.
 *
 * Cada CharacterVersion guarda: ADN textual, semilla, referencia principal,
 * hoja de giro, hoja de expresiones, voz (id + ajustes) y preview de voz.
 * Un cambio a mitad de historia crea una versión nueva con effectiveFromChapter;
 * los capítulos ya renderizados no cambian, los siguientes usan la nueva versión.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BibleCharacter, StoryBible, UpdateCharacterInput, VoiceOptionDTO } from "@fruti/shared";
import type { CharacterVersion, Prisma } from "@prisma/client";
import { env } from "../config";
import { prisma } from "../lib/db";
import { randomSeed } from "../lib/seed";
import { keys, providerImageRef, putFile } from "../lib/storage";
import { buildCharacterDNA, expressionSheetPrompt, referenceSheetPrompt, setReferencePrompt, turnaroundPrompt } from "../prompts/character";
import { DEFAULT_VOICE_SETTINGS, voicePreviewText, type VoiceSettings } from "../prompts/voice";
import { imageProvider } from "../providers/image";
import { ttsProvider } from "../providers/tts";

const json = (v: unknown) => v as Prisma.InputJsonValue;

function workDir(...parts: string[]) {
  return path.resolve(env.WORK_DIR, ...parts);
}

export async function designCharacterVersion(versionId: string) {
  const v = await prisma.characterVersion.update({
    where: { id: versionId },
    data: { status: "GENERATING", error: null },
    include: { character: { include: { novela: true } } },
  });
  const { character } = v;
  const novelaId = character.novelaId;
  const dir = workDir(novelaId, "characters", character.key, `v${v.version}`);
  await mkdir(dir, { recursive: true });
  const bible = character.bible as unknown as BibleCharacter;

  const previous = await prisma.characterVersion.findFirst({
    where: { characterId: character.id, version: { lt: v.version }, status: "READY" },
    orderBy: { version: "desc" },
  });
  const visualChanged = !previous || JSON.stringify(previous.visual) !== JSON.stringify(v.visual);
  // "Regenerar" crea una versión con otra semilla y el mismo visual → diseño nuevo desde cero
  const reseeded = Boolean(previous && previous.seed !== v.seed);

  let referenceImageKey = previous?.referenceImageKey ?? null;
  let turnaroundKey = previous?.turnaroundKey ?? null;
  let expressionSheetKey = previous?.expressionSheetKey ?? null;

  if (visualChanged || reseeded || !referenceImageKey) {
    const label = `${character.name}\n${character.fruit} · v${v.version}`;
    const refOut = path.join(dir, "reference.png");
    if (previous?.referenceImageKey && !reseeded) {
      // Rediseño: se parte de la referencia anterior para conservar identidad (cara, forma)
      await imageProvider.editWithReferences({
        prompt: `Same character as the reference image, keep face, body shape and identity, but update the design to: ${v.dnaPrompt}. ${referenceSheetPrompt("")}`,
        images: [await providerImageRef(previous.referenceImageKey)],
        seed: v.seed,
        aspectRatio: "3:4",
        out: refOut,
        label,
      });
    } else {
      await imageProvider.textToImage({ prompt: referenceSheetPrompt(v.dnaPrompt), seed: v.seed, aspectRatio: "3:4", out: refOut, label });
    }
    referenceImageKey = await putFile(keys.characterRef(novelaId, character.key, v.version), refOut);
    const refImage = await providerImageRef(referenceImageKey);

    const [turn, expr] = await Promise.all([
      imageProvider.editWithReferences({ prompt: turnaroundPrompt(v.dnaPrompt), images: [refImage], seed: v.seed, aspectRatio: "16:9", out: path.join(dir, "turnaround.png"), label: `${character.name}\nturnaround` }),
      imageProvider.editWithReferences({ prompt: expressionSheetPrompt(v.dnaPrompt), images: [refImage], seed: v.seed + 1, aspectRatio: "1:1", out: path.join(dir, "expressions.png"), label: `${character.name}\nexpresiones` }),
    ]);
    turnaroundKey = await putFile(keys.characterTurnaround(novelaId, character.key, v.version), turn);
    expressionSheetKey = await putFile(keys.characterExpressions(novelaId, character.key, v.version), expr);
  }

  // Voz: si no tiene, se asigna automáticamente la mejor del catálogo no usada por otro personaje
  let voiceId = v.voiceId;
  let voiceName = v.voiceName;
  if (!voiceId) {
    const picked = await pickVoice(novelaId, character.id, bible);
    voiceId = picked.id;
    voiceName = picked.name;
  }
  const previewOut = path.join(dir, "voice.mp3");
  await ttsProvider.speak({
    voiceId,
    text: voicePreviewText(character.name, bible.catchphrase),
    settings: v.voiceSettings as unknown as VoiceSettings,
    seed: v.seed,
    out: previewOut,
  });
  const voicePreviewKey = await putFile(keys.voicePreview(novelaId, character.key, v.version), previewOut);

  await prisma.characterVersion.update({
    where: { id: v.id },
    data: { referenceImageKey, turnaroundKey, expressionSheetKey, voiceId, voiceName, voicePreviewKey, status: "READY" },
  });
}

export async function designSet(setId: string) {
  const set = await prisma.setLocation.findUniqueOrThrow({ where: { id: setId }, include: { novela: true } });
  const dir = workDir(set.novelaId, "sets");
  await mkdir(dir, { recursive: true });
  const out = await imageProvider.textToImage({
    prompt: setReferencePrompt(set.description),
    seed: set.seed,
    aspectRatio: set.novela.aspectRatio as "9:16" | "16:9",
    out: path.join(dir, `${set.key}.png`),
    label: set.name,
  });
  const referenceImageKey = await putFile(keys.setRef(set.novelaId, set.key), out);
  await prisma.setLocation.update({ where: { id: set.id }, data: { referenceImageKey } });
}

// ---------------------------------------------------------------------------
// Selección de voz
// ---------------------------------------------------------------------------

const GENDER: Record<string, string[]> = { femenina: ["female", "femenina", "woman"], masculina: ["male", "masculina", "man"], neutra: ["neutral", "non-binary"] };
const AGE: Record<string, string[]> = { nino: ["child", "kid"], joven: ["young"], adulto: ["middle", "middle aged", "adult"], mayor: ["old", "elderly"] };
const ACCENT: Record<string, string[]> = {
  mexicano: ["mexic"], colombiano: ["colomb"], venezolano: ["venez"], argentino: ["argent", "rioplat"], caribeno: ["caribb", "cuban", "puerto", "dominican"], chileno: ["chile"], neutro: ["latin", "spanish", "neutral"],
};

export function scoreVoice(v: VoiceOptionDTO, c: BibleCharacter) {
  const hay = (Object.values(v.labels).join(" ") + " " + v.name).toLowerCase();
  const words = new Set(hay.split(/[^a-záéíóúñ]+/));
  let s = 0;
  // palabra completa: "female" contiene "male"
  if (GENDER[c.voice.gender]?.some((g) => words.has(g))) s += 10;
  if (AGE[c.voice.ageRange]?.some((a) => hay.includes(a))) s += 4;
  if (ACCENT[c.voice.accent]?.some((a) => hay.includes(a))) s += 5;
  if (/latin|spanish|español|mexic|colomb/.test(hay)) s += 3;
  for (const word of c.voice.timbre.toLowerCase().split(/\W+/)) if (word.length > 3 && hay.includes(word)) s += 1;
  return s;
}

async function pickVoice(novelaId: string, characterId: string, bible: BibleCharacter) {
  const voices = await ttsProvider.listVoices();
  if (!voices.length) throw new Error("No hay voces disponibles en el proveedor de TTS");
  const used = new Set(
    (
      await prisma.characterVersion.findMany({
        where: { character: { novelaId, id: { not: characterId } }, voiceId: { not: null } },
        select: { voiceId: true },
      })
    ).map((x) => x.voiceId),
  );
  const ranked = voices
    .map((v) => ({ v, s: scoreVoice(v, bible) - (used.has(v.id) ? 50 : 0) }))
    .sort((a, b) => b.s - a.s);
  return ranked[0].v;
}

/**
 * Asigna voces a todos los personajes de golpe (antes de encolar los diseños en
 * paralelo), para que dos personajes nunca acaben con la misma voz.
 */
export async function assignVoices(novelaId: string) {
  const characters = await prisma.character.findMany({ where: { novelaId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  const voices = await ttsProvider.listVoices();
  const used = new Set(characters.map((c) => c.versions[0]?.voiceId).filter(Boolean));
  for (const c of characters) {
    const v = c.versions[0];
    if (!v || v.voiceId) continue;
    const bible = c.bible as unknown as BibleCharacter;
    const best = voices
      .map((voice) => ({ voice, s: scoreVoice(voice, bible) - (used.has(voice.id) ? 50 : 0) }))
      .sort((a, b) => b.s - a.s)[0];
    if (!best) break;
    used.add(best.voice.id);
    await prisma.characterVersion.update({ where: { id: v.id }, data: { voiceId: best.voice.id, voiceName: best.voice.name } });
  }
}

export async function listVoices() {
  return ttsProvider.listVoices();
}

// ---------------------------------------------------------------------------
// Cambios de diseño / voz (también a mitad de historia)
// ---------------------------------------------------------------------------

export async function updateCharacter(characterId: string, input: UpdateCharacterInput) {
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 }, novela: true },
  });
  const latest = character.versions[0];
  const bible = character.bible as unknown as BibleCharacter;

  const visual = { ...(latest.visual as unknown as BibleCharacter["visual"]), ...(input.visual ?? {}) };
  const newBible: BibleCharacter = {
    ...bible,
    name: input.name ?? bible.name,
    personality: input.personality ?? bible.personality,
    speakingStyle: input.speakingStyle ?? bible.speakingStyle,
    visual,
  };
  const voiceSettings = { ...(latest.voiceSettings as unknown as VoiceSettings), ...(input.voiceSettings ?? {}) };

  // Si el cambio es solo textual (nombre/personalidad) no hace falta versión nueva.
  const designChanged = Boolean(input.visual || input.voiceId || input.voiceSettings);
  await prisma.character.update({
    where: { id: characterId },
    data: { name: newBible.name, bible: json(newBible), approved: designChanged ? false : character.approved },
  });
  await syncBibleCharacter(character.novelaId, character.key, newBible);
  if (!designChanged) return null;

  const version = await prisma.characterVersion.create({
    data: {
      characterId,
      version: latest.version + 1,
      effectiveFromChapter: input.effectiveFromChapter ?? 1,
      visual: json(visual),
      dnaPrompt: buildCharacterDNA(newBible, visual),
      seed: latest.seed, // misma semilla: el rediseño parte de la referencia anterior
      voiceId: input.voiceId ?? latest.voiceId,
      voiceName: input.voiceId ? null : latest.voiceName,
      voiceSettings: json(voiceSettings ?? DEFAULT_VOICE_SETTINGS),
    },
  });
  if (input.voiceId) {
    const v = (await ttsProvider.listVoices()).find((x) => x.id === input.voiceId);
    if (v) await prisma.characterVersion.update({ where: { id: version.id }, data: { voiceName: v.name } });
  }
  return version;
}

/** Mantiene la biblia de la novela sincronizada (Claude la lee en los capítulos siguientes). */
async function syncBibleCharacter(novelaId: string, key: string, c: BibleCharacter) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId } });
  const bible = novela.bible as unknown as StoryBible | null;
  if (!bible) return;
  bible.characters = bible.characters.map((x) => (x.key === key ? c : x));
  await prisma.novela.update({ where: { id: novelaId }, data: { bible: json(bible) } });
}

/** "Regenerar diseño": misma descripción, semilla nueva. Reemplaza la última versión si aún no se usó. */
export async function regenerateCharacter(characterId: string) {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  const latest = character.versions[0];
  await prisma.character.update({ where: { id: characterId }, data: { approved: false } });
  return prisma.characterVersion.create({
    data: {
      characterId,
      version: latest.version + 1,
      effectiveFromChapter: latest.effectiveFromChapter,
      visual: json(latest.visual),
      dnaPrompt: latest.dnaPrompt,
      seed: randomSeed(),
      voiceId: latest.voiceId,
      voiceName: latest.voiceName,
      voiceSettings: json(latest.voiceSettings),
    },
  });
}

/** Versión vigente de cada personaje para el capítulo N. */
export function versionForChapter<T extends Pick<CharacterVersion, "version" | "effectiveFromChapter" | "status">>(versions: T[], chapter: number): T | null {
  return (
    versions
      .filter((v) => v.effectiveFromChapter <= chapter && v.status === "READY")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}
