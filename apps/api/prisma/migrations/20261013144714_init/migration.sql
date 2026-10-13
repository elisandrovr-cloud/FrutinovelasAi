-- CreateEnum
CREATE TYPE "NovelaStatus" AS ENUM ('DRAFT', 'SCRIPTING', 'SCRIPT_READY', 'DESIGNING', 'DESIGN_READY', 'PRODUCING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductionMode" AS ENUM ('NONE', 'ALL', 'SINGLE');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('PENDING', 'SCRIPTED', 'QUEUED', 'RENDERING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('ZIP', 'LONG_VIDEO', 'VERTICAL_SERIES');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Novela" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "genres" TEXT[],
    "chapterCount" INTEGER NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "subtitles" BOOLEAN NOT NULL DEFAULT true,
    "accent" TEXT NOT NULL DEFAULT 'mexicano',
    "status" "NovelaStatus" NOT NULL DEFAULT 'DRAFT',
    "productionMode" "ProductionMode" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL DEFAULT 'Nueva FrutiNovela',
    "tagline" TEXT,
    "logline" TEXT,
    "bible" JSONB,
    "masterSeed" INTEGER NOT NULL,
    "coverKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Novela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "novelaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fruit" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "bible" JSONB NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterVersion" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFromChapter" INTEGER NOT NULL DEFAULT 1,
    "visual" JSONB NOT NULL,
    "dnaPrompt" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "referenceImageKey" TEXT,
    "turnaroundKey" TEXT,
    "expressionSheetKey" TEXT,
    "voiceId" TEXT,
    "voiceName" TEXT,
    "voiceSettings" JSONB NOT NULL,
    "voicePreviewKey" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetLocation" (
    "id" TEXT NOT NULL,
    "novelaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "referenceImageKey" TEXT,

    CONSTRAINT "SetLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "novelaId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "outline" JSONB NOT NULL,
    "script" JSONB,
    "scriptStale" BOOLEAN NOT NULL DEFAULT false,
    "status" "ChapterStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "videoKey" TEXT,
    "verticalKey" TEXT,
    "subtitlesKey" TEXT,
    "thumbnailKey" TEXT,
    "lastFrameKey" TEXT,
    "durationSec" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "shotNumber" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "keyframePrompt" TEXT,
    "videoPrompt" TEXT,
    "keyframeKey" TEXT,
    "videoKey" TEXT,
    "audioKey" TEXT,
    "lipsyncKey" TEXT,
    "finalKey" TEXT,
    "cues" JSONB,
    "durationSec" DOUBLE PRECISION,
    "provider" TEXT,
    "providerTaskId" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Export" (
    "id" TEXT NOT NULL,
    "novelaId" TEXT NOT NULL,
    "kind" "ExportKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "fileKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Novela_ownerId_createdAt_idx" ON "Novela"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Character_novelaId_key_key" ON "Character"("novelaId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVersion_characterId_version_key" ON "CharacterVersion"("characterId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SetLocation_novelaId_key_key" ON "SetLocation"("novelaId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_novelaId_number_key" ON "Chapter"("novelaId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Shot_chapterId_order_key" ON "Shot"("chapterId", "order");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_novelaId_fkey" FOREIGN KEY ("novelaId") REFERENCES "Novela"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVersion" ADD CONSTRAINT "CharacterVersion_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetLocation" ADD CONSTRAINT "SetLocation_novelaId_fkey" FOREIGN KEY ("novelaId") REFERENCES "Novela"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_novelaId_fkey" FOREIGN KEY ("novelaId") REFERENCES "Novela"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Export" ADD CONSTRAINT "Export_novelaId_fkey" FOREIGN KEY ("novelaId") REFERENCES "Novela"("id") ON DELETE CASCADE ON UPDATE CASCADE;
