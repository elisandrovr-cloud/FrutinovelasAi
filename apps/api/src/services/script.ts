/**
 * Generación y normalización del guion.
 *  generateBible         → crea personajes, escenarios y capítulos (outline) en BD
 *  generateChapterScript → guion plano a plano del capítulo N, usando el endState de N-1
 */
import { ChapterScriptSchema, StoryBibleSchema } from "@fruti/shared";
import type { ChapterOutline, ChapterScript, CreateNovelaInput, Genre, StoryBible } from "@fruti/shared";
import type { Prisma } from "@prisma/client";
import { env } from "../config";
import { prisma } from "../lib/db";
import { deriveSeed } from "../lib/seed";
import { buildCharacterDNA } from "../prompts/character";
import { biblePrompt, chapterPrompt, SCRIPTWRITER_SYSTEM } from "../prompts/script";
import { DEFAULT_VOICE_SETTINGS } from "../prompts/voice";
import { claudeStructured } from "../providers/llm/claude";
import { mockBible, mockChapter } from "../providers/llm/mock";

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function novelaInput(n: { prompt: string; genres: string[]; chapterCount: number; totalMinutes: number; aspectRatio: string; subtitles: boolean; accent: string }): CreateNovelaInput {
  return {
    prompt: n.prompt,
    genres: n.genres as Genre[],
    chapterCount: n.chapterCount,
    totalMinutes: n.totalMinutes,
    aspectRatio: n.aspectRatio as "9:16" | "16:9",
    subtitles: n.subtitles,
    accent: n.accent as CreateNovelaInput["accent"],
  };
}

export async function generateBible(novelaId: string) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId } });
  const input = novelaInput(novela);

  const raw =
    env.LLM_PROVIDER === "mock"
      ? mockBible(input)
      : await claudeStructured({ system: SCRIPTWRITER_SYSTEM, prompt: biblePrompt(input), schema: StoryBibleSchema, effort: "high" });
  const bible = normalizeBible(raw, input.chapterCount);

  await prisma.$transaction(async (tx) => {
    // Regenerar la biblia borra el contenido anterior
    await tx.character.deleteMany({ where: { novelaId } });
    await tx.setLocation.deleteMany({ where: { novelaId } });
    await tx.chapter.deleteMany({ where: { novelaId } });

    await tx.novela.update({
      where: { id: novelaId },
      data: { bible: json(bible), title: bible.title, tagline: bible.tagline, logline: bible.logline },
    });
    for (const c of bible.characters) {
      await tx.character.create({
        data: {
          novelaId,
          key: c.key,
          name: c.name,
          fruit: c.fruit,
          role: c.role,
          bible: json(c),
          versions: {
            create: {
              version: 1,
              effectiveFromChapter: 1,
              visual: json(c.visual),
              dnaPrompt: buildCharacterDNA(c, c.visual),
              seed: deriveSeed(novela.masterSeed, "char", c.key, 1),
              voiceSettings: json(DEFAULT_VOICE_SETTINGS),
            },
          },
        },
      });
    }
    await tx.setLocation.createMany({
      data: bible.sets.map((s) => ({ novelaId, key: s.key, name: s.name, description: s.promptEn || s.description, seed: deriveSeed(novela.masterSeed, "set", s.key) })),
    });
    await tx.chapter.createMany({
      data: bible.chapters.map((o) => ({ novelaId, number: o.number, title: o.title, outline: json(o) })),
    });
  });
  return bible;
}

export async function generateChapterScript(novelaId: string, number: number) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId } });
  const bible = novela.bible as unknown as StoryBible;
  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { novelaId_number: { novelaId, number } } });
  const prev = number > 1 ? await prisma.chapter.findUnique({ where: { novelaId_number: { novelaId, number: number - 1 } } }) : null;
  const previous = (prev?.script as unknown as ChapterScript | null) ?? null;
  if (number > 1 && !previous) throw new Error(`El capítulo ${number - 1} aún no tiene guion`);

  const outline = chapter.outline as unknown as ChapterOutline;
  const targetSeconds = Math.round((novela.totalMinutes * 60) / novela.chapterCount);

  const raw =
    env.LLM_PROVIDER === "mock"
      ? mockChapter(bible, outline, targetSeconds, previous)
      : await claudeStructured({
          system: SCRIPTWRITER_SYSTEM,
          prompt: chapterPrompt({ bible, outline, previous, targetSeconds, totalChapters: novela.chapterCount }),
          schema: ChapterScriptSchema,
          effort: "medium",
        });
  const script = normalizeChapter(raw, bible, number);

  await prisma.chapter.update({
    where: { id: chapter.id },
    data: { script: json(script), title: script.title, status: chapter.status === "DONE" ? "DONE" : "SCRIPTED", scriptStale: chapter.status === "DONE" },
  });
  return script;
}

// ---------------------------------------------------------------------------
// Normalización: el modelo casi siempre acierta, pero el pipeline de video no
// perdona: duraciones 5/10, keys válidas, numeración continua, etc.
// ---------------------------------------------------------------------------

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function normalizeBible(b: StoryBible, chapterCount: number): StoryBible {
  const seen = new Set<string>();
  const characters = b.characters.map((c) => {
    let key = slug(c.key || c.name) || "personaje";
    while (seen.has(key)) key += "_2";
    seen.add(key);
    return { ...c, key };
  });
  const sets = b.sets.map((s) => ({ ...s, key: slug(s.key || s.name) }));
  const chapters = b.chapters.slice(0, chapterCount).map((c, i) => ({ ...c, number: i + 1 }));
  if (chapters.length < chapterCount) throw new Error(`La biblia trae ${chapters.length} capítulos y se pidieron ${chapterCount}`);
  chapters[chapters.length - 1].cliffhanger = "";
  return { ...b, characters, sets, chapters };
}

export function normalizeChapter(s: ChapterScript, bible: StoryBible, number: number): ChapterScript {
  const charKeys = new Set([...bible.characters.map((c) => c.key), "narrador"]);
  const setKeys = bible.sets.map((x) => x.key);
  const resolveChar = (k: string) => {
    const s2 = slug(k);
    if (charKeys.has(s2)) return s2;
    // tolera que el modelo use el nombre en vez del key
    return bible.characters.find((c) => slug(c.name) === s2 || s2.includes(slug(c.fruit)))?.key ?? null;
  };

  const scenes = s.scenes.map((scene, si) => ({
    ...scene,
    number: si + 1,
    setKey: setKeys.includes(slug(scene.setKey)) ? slug(scene.setKey) : setKeys[0],
    shots: scene.shots.map((shot, k) => {
      const dialogue = shot.dialogue
        .map((d) => ({ ...d, characterKey: resolveChar(d.characterKey) ?? "narrador" }))
        .filter((d) => d.text.trim().length > 0);
      const words = dialogue.reduce((n, d) => n + d.text.split(/\s+/).length, 0);
      // 5 s admite ~11 palabras; si hay más diálogo, el plano pasa a 10 s
      const durationSec = shot.durationSec >= 8 || words > 11 ? 10 : 5;
      return {
        ...shot,
        number: k + 1,
        durationSec,
        charactersOnScreen: shot.charactersOnScreen.map(resolveChar).filter((x): x is string => !!x && x !== "narrador").slice(0, 3),
        dialogue,
      };
    }),
  }));
  return { ...s, number, scenes };
}
