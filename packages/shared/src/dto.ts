/** Formas JSON que devuelve la API (independientes de Prisma, para el frontend). */
import type { AspectRatio, ChapterStatus, NovelaStatus } from "./constants";
import type { BibleCharacter, ChapterOutline, ChapterScript, Genre, StoryBible } from "./schemas";

export interface CharacterVersionDTO {
  id: string;
  version: number;
  effectiveFromChapter: number;
  status: "PENDING" | "GENERATING" | "READY" | "FAILED";
  referenceImageUrl: string | null;
  expressionSheetUrl: string | null;
  voiceId: string | null;
  voiceName: string | null;
  voiceSettings: { stability: number; similarityBoost: number; style: number };
  voicePreviewUrl: string | null;
  seed: number;
  dnaPrompt: string;
}

export interface CharacterDTO {
  id: string;
  key: string;
  name: string;
  fruit: string;
  role: string;
  approved: boolean;
  bible: BibleCharacter;
  versions: CharacterVersionDTO[];
}

export interface ShotDTO {
  id: string;
  order: number;
  sceneNumber: number;
  shotNumber: number;
  status: string;
  keyframeUrl: string | null;
  videoUrl: string | null;
  error: string | null;
}

export interface ChapterDTO {
  id: string;
  number: number;
  title: string;
  status: ChapterStatus;
  progress: number;
  currentStep: string | null;
  outline: ChapterOutline;
  script: ChapterScript | null;
  scriptStale: boolean;
  videoUrl: string | null;
  verticalUrl: string | null;
  subtitlesUrl: string | null;
  subtitlesVttUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  error: string | null;
  shots?: ShotDTO[];
}

export interface ExportDTO {
  id: string;
  kind: "ZIP" | "LONG_VIDEO" | "VERTICAL_SERIES";
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  url: string | null;
  createdAt: string;
}

export interface NovelaSummaryDTO {
  id: string;
  title: string;
  tagline: string | null;
  status: NovelaStatus;
  genres: Genre[];
  chapterCount: number;
  chaptersDone: number;
  coverUrl: string | null;
  createdAt: string;
}

export interface NovelaDTO extends NovelaSummaryDTO {
  prompt: string;
  logline: string | null;
  totalMinutes: number;
  aspectRatio: AspectRatio;
  subtitles: boolean;
  productionMode: "NONE" | "ALL" | "SINGLE";
  bible: StoryBible | null;
  error: string | null;
  characters: CharacterDTO[];
  chapters: ChapterDTO[];
  exports: ExportDTO[];
}

export interface VoiceOptionDTO {
  id: string;
  name: string;
  labels: Record<string, string>;
  previewUrl: string | null;
}
