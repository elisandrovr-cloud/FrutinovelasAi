/** Prisma → DTOs JSON con URLs (firmadas o públicas) listas para el navegador. */
import type { ChapterDTO, CharacterDTO, ExportDTO, NovelaDTO, NovelaSummaryDTO, ShotDTO } from "@fruti/shared";
import type { Chapter, Character, CharacterVersion, Export, Novela, Shot } from "@prisma/client";
import { urlFor } from "../lib/storage";

type FullNovela = Novela & {
  characters: (Character & { versions: CharacterVersion[] })[];
  chapters: (Chapter & { shots?: Shot[] })[];
  exports: Export[];
};

export async function novelaSummary(n: Novela & { chapters: Pick<Chapter, "status">[] }): Promise<NovelaSummaryDTO> {
  return {
    id: n.id,
    title: n.title,
    tagline: n.tagline,
    status: n.status,
    genres: n.genres as NovelaSummaryDTO["genres"],
    chapterCount: n.chapterCount,
    chaptersDone: n.chapters.filter((c) => c.status === "DONE").length,
    coverUrl: await urlFor(n.coverKey),
    createdAt: n.createdAt.toISOString(),
  };
}

export async function novelaDTO(n: FullNovela): Promise<NovelaDTO> {
  return {
    ...(await novelaSummary(n)),
    prompt: n.prompt,
    logline: n.logline,
    totalMinutes: n.totalMinutes,
    aspectRatio: n.aspectRatio as NovelaDTO["aspectRatio"],
    subtitles: n.subtitles,
    productionMode: n.productionMode,
    bible: n.bible as unknown as NovelaDTO["bible"],
    error: n.error,
    characters: await Promise.all(n.characters.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(characterDTO)),
    chapters: await Promise.all(n.chapters.sort((a, b) => a.number - b.number).map(chapterDTO)),
    exports: await Promise.all(n.exports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(exportDTO)),
  };
}

export async function characterDTO(c: Character & { versions: CharacterVersion[] }): Promise<CharacterDTO> {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    fruit: c.fruit,
    role: c.role,
    approved: c.approved,
    bible: c.bible as unknown as CharacterDTO["bible"],
    versions: await Promise.all(
      c.versions
        .sort((a, b) => b.version - a.version)
        .map(async (v) => ({
          id: v.id,
          version: v.version,
          effectiveFromChapter: v.effectiveFromChapter,
          status: v.status,
          referenceImageUrl: await urlFor(v.referenceImageKey),
          expressionSheetUrl: await urlFor(v.expressionSheetKey),
          voiceId: v.voiceId,
          voiceName: v.voiceName,
          voiceSettings: v.voiceSettings as unknown as CharacterDTO["versions"][number]["voiceSettings"],
          voicePreviewUrl: await urlFor(v.voicePreviewKey),
          seed: v.seed,
          dnaPrompt: v.dnaPrompt,
        })),
    ),
  };
}

export async function chapterDTO(c: Chapter & { shots?: Shot[] }): Promise<ChapterDTO> {
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    status: c.status,
    progress: c.progress,
    currentStep: c.currentStep,
    outline: c.outline as unknown as ChapterDTO["outline"],
    script: c.script as unknown as ChapterDTO["script"],
    scriptStale: c.scriptStale,
    videoUrl: await urlFor(c.videoKey),
    verticalUrl: await urlFor(c.verticalKey),
    subtitlesUrl: await urlFor(c.subtitlesKey),
    subtitlesVttUrl: await urlFor(c.subtitlesKey?.replace(/\.srt$/, ".vtt")),
    thumbnailUrl: await urlFor(c.thumbnailKey),
    durationSec: c.durationSec,
    error: c.error,
    shots: c.shots ? await Promise.all(c.shots.sort((a, b) => a.order - b.order).map(shotDTO)) : undefined,
  };
}

async function shotDTO(s: Shot): Promise<ShotDTO> {
  return {
    id: s.id,
    order: s.order,
    sceneNumber: s.sceneNumber,
    shotNumber: s.shotNumber,
    status: s.status,
    keyframeUrl: await urlFor(s.keyframeKey),
    videoUrl: await urlFor(s.finalKey ?? s.videoKey),
    error: s.error,
  };
}

export async function exportDTO(e: Export): Promise<ExportDTO> {
  return { id: e.id, kind: e.kind, status: e.status, url: await urlFor(e.fileKey), createdAt: e.createdAt.toISOString() };
}
