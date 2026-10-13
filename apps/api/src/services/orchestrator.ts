/**
 * Máquina de estados de una novela. Las rutas HTTP y los workers solo llaman a
 * estas funciones, así las transiciones están en un único sitio.
 *
 *   DRAFT ─script→ SCRIPTING ─→ SCRIPT_READY ─design→ DESIGNING ─→ DESIGN_READY
 *     ─produce(all|next)→ PRODUCING ─(cap N listo, mode ALL)→ encola N+1 … → COMPLETED
 *                          │ pause → PAUSED ─resume→ PRODUCING
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { assignVoices } from "./characters";
import { designQueue, enqueueChapter, exportQueue, scriptQueue } from "../queues";

export class ConflictError extends Error {}

export async function startScript(novelaId: string) {
  await prisma.novela.update({ where: { id: novelaId }, data: { status: "SCRIPTING", error: null } });
  await scriptQueue.add("bible", { type: "bible", novelaId });
}

/** Tras la biblia: guiones de capítulos en cadena (cada uno necesita el endState del anterior). */
export async function onBibleReady(novelaId: string) {
  await scriptQueue.add("chapter-script", { type: "chapter-script", novelaId, number: 1, chain: true });
}

export async function onChapterScripted(novelaId: string, number: number, chain: boolean) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId } });
  if (chain && number < novela.chapterCount) {
    await scriptQueue.add("chapter-script", { type: "chapter-script", novelaId, number: number + 1, chain: true });
  } else if (novela.status === "SCRIPTING") {
    const missing = await prisma.chapter.count({ where: { novelaId, script: { equals: Prisma.DbNull } } });
    if (missing === 0) await prisma.novela.update({ where: { id: novelaId }, data: { status: "SCRIPT_READY" } });
  }
}

/** Regenera el guion de un capítulo (y opcionalmente los siguientes, para mantener continuidad). */
export async function regenerateChapterScript(novelaId: string, number: number, cascade: boolean) {
  // Reintento tras un fallo del guion: la novela vuelve a "escribiendo"
  await prisma.novela.updateMany({ where: { id: novelaId, status: "FAILED", chapters: { some: { script: { equals: Prisma.DbNull } } } }, data: { status: "SCRIPTING", error: null } });
  await scriptQueue.add("chapter-script", { type: "chapter-script", novelaId, number, chain: cascade });
}

export async function startDesign(novelaId: string, characterIds?: string[]) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId }, include: { sets: true } });
  if (!["SCRIPT_READY", "DESIGN_READY", "DESIGNING", "PAUSED", "COMPLETED", "PRODUCING"].includes(novela.status)) {
    throw new ConflictError("Primero hay que terminar el guion");
  }
  const characters = await prisma.character.findMany({
    where: { novelaId, ...(characterIds ? { id: { in: characterIds } } : {}) },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (["SCRIPT_READY", "DESIGN_READY"].includes(novela.status)) {
    await prisma.novela.update({ where: { id: novelaId }, data: { status: "DESIGNING" } });
  }
  await assignVoices(novelaId);
  for (const c of characters) {
    const v = c.versions[0];
    await prisma.characterVersion.update({ where: { id: v.id }, data: { status: "PENDING" } });
    await designQueue.add("character", { type: "character", versionId: v.id });
  }
  if (!characterIds) for (const s of novela.sets.filter((x) => !x.referenceImageKey)) await designQueue.add("set", { type: "set", setId: s.id });
}

export async function onDesignProgress(novelaId: string) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId } });
  if (novela.status !== "DESIGNING") return;
  const pending = await prisma.characterVersion.count({ where: { character: { novelaId }, status: { in: ["PENDING", "GENERATING"] } } });
  if (pending === 0) await prisma.novela.update({ where: { id: novelaId }, data: { status: "DESIGN_READY" } });
}

/**
 * mode ALL: "Generar todos los videos en secuencia" (desde el primer capítulo no terminado)
 * mode SINGLE: "Generar solo el siguiente capítulo"
 */
export async function startProduction(novelaId: string, mode: "ALL" | "SINGLE", onlyNumber?: number) {
  const novela = await prisma.novela.findUniqueOrThrow({
    where: { id: novelaId },
    include: { chapters: { orderBy: { number: "asc" } }, characters: true },
  });
  if (novela.characters.some((c) => !c.approved)) throw new ConflictError("Aprueba todos los personajes antes de producir");
  if (novela.chapters.some((c) => c.status === "RENDERING" || c.status === "QUEUED")) throw new ConflictError("Ya hay un capítulo en producción");

  const target = onlyNumber
    ? novela.chapters.find((c) => c.number === onlyNumber)
    : novela.chapters.find((c) => c.status !== "DONE" || c.scriptStale);
  if (!target) throw new ConflictError("Todos los capítulos ya están producidos");
  if (target.number > 1) {
    const prev = novela.chapters.find((c) => c.number === target.number - 1);
    if (prev?.status !== "DONE") throw new ConflictError(`El capítulo ${target.number - 1} debe estar terminado (continuidad visual)`);
  }

  await prisma.novela.update({ where: { id: novelaId }, data: { status: "PRODUCING", productionMode: mode, error: null } });
  await prisma.chapter.update({ where: { id: target.id }, data: { status: "QUEUED", progress: 0, currentStep: "En cola", error: null } });
  await enqueueChapter(novelaId, target.number, target.attempts);
}

export async function onChapterProduced(novelaId: string, number: number) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId }, include: { chapters: { orderBy: { number: "asc" } } } });
  const allDone = novela.chapters.every((c) => c.status === "DONE");
  if (allDone) {
    await prisma.novela.update({ where: { id: novelaId }, data: { status: "COMPLETED", productionMode: "NONE" } });
    return;
  }
  if (novela.productionMode === "ALL" && novela.status === "PRODUCING") {
    const next = novela.chapters.find((c) => c.number === number + 1);
    if (next && (next.status !== "DONE" || next.scriptStale)) {
      await prisma.chapter.update({ where: { id: next.id }, data: { status: "QUEUED", progress: 0, currentStep: "En cola", error: null } });
      await enqueueChapter(novelaId, next.number, next.attempts);
      return;
    }
  }
  await prisma.novela.update({ where: { id: novelaId }, data: { status: "DESIGN_READY", productionMode: "NONE" } });
}

export async function pauseProduction(novelaId: string) {
  await prisma.novela.update({ where: { id: novelaId }, data: { status: "PAUSED", productionMode: "NONE" } });
}

export async function requestExport(novelaId: string, kind: "ZIP" | "LONG_VIDEO" | "VERTICAL_SERIES") {
  const exp = await prisma.export.create({ data: { novelaId, kind } });
  await exportQueue.add("export", { exportId: exp.id });
  return exp;
}
