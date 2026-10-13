/**
 * Proceso worker (escala horizontalmente: N réplicas comparten Redis).
 * Los errores no recuperables (ProviderError.retryable=false, validación) se
 * marcan UnrecoverableError para que BullMQ no gaste reintentos.
 */
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { env } from "./config";
import { prisma } from "./lib/db";
import { ProviderError } from "./lib/http";
import { connection, type DesignJob, type ExportJob, type ProductionJob, type ScriptJob } from "./queues";
import { designCharacterVersion, designSet } from "./services/characters";
import { runExport } from "./services/export";
import { onBibleReady, onChapterProduced, onChapterScripted, onDesignProgress } from "./services/orchestrator";
import { PausedError, produceChapter } from "./services/production";
import { generateBible, generateChapterScript } from "./services/script";

function classify(err: unknown): never {
  if (err instanceof ProviderError && !err.retryable) throw new UnrecoverableError(err.message);
  throw err;
}

const isLastAttempt = (job: Job, err: Error) => err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

// ---------------------------------------------------------------- guion
const scriptWorker = new Worker<ScriptJob>(
  "script",
  async (job) => {
    try {
      if (job.data.type === "bible") {
        await generateBible(job.data.novelaId);
        await onBibleReady(job.data.novelaId);
      } else {
        await generateChapterScript(job.data.novelaId, job.data.number);
        await onChapterScripted(job.data.novelaId, job.data.number, job.data.chain);
      }
    } catch (e) {
      classify(e);
    }
  },
  { connection, concurrency: 4 },
);
scriptWorker.on("failed", async (job, err) => {
  if (!job || !isLastAttempt(job, err)) return;
  const what = job.data.type === "bible" ? "la biblia" : `el guion del capítulo ${job.data.number}`;
  await prisma.novela.update({ where: { id: job.data.novelaId }, data: { status: "FAILED", error: `Error generando ${what}: ${err.message}` } });
});

// ---------------------------------------------------------------- diseño
const designWorker = new Worker<DesignJob>(
  "design",
  async (job) => {
    try {
      if (job.data.type === "character") {
        await designCharacterVersion(job.data.versionId);
        const v = await prisma.characterVersion.findUniqueOrThrow({ where: { id: job.data.versionId }, include: { character: true } });
        await onDesignProgress(v.character.novelaId);
      } else {
        await designSet(job.data.setId);
      }
    } catch (e) {
      classify(e);
    }
  },
  { connection, concurrency: 3 },
);
designWorker.on("failed", async (job, err) => {
  if (!job || job.data.type !== "character" || !isLastAttempt(job, err)) return;
  const v = await prisma.characterVersion.update({ where: { id: job.data.versionId }, data: { status: "FAILED", error: err.message }, include: { character: true } });
  await onDesignProgress(v.character.novelaId);
});

// ---------------------------------------------------------------- producción (secuencial por novela)
const productionWorker = new Worker<ProductionJob>(
  "production",
  async (job) => {
    const { novelaId, number } = job.data;
    try {
      await produceChapter(novelaId, number);
    } catch (e) {
      if (e instanceof PausedError) {
        await prisma.chapter.update({ where: { novelaId_number: { novelaId, number } }, data: { status: "SCRIPTED", currentStep: "En pausa" } });
        return;
      }
      classify(e);
    }
    await onChapterProduced(novelaId, number);
  },
  {
    connection,
    // Dos novelas distintas a la vez por réplica; dentro de un capítulo SHOT_CONCURRENCY
    // limita las llamadas simultáneas a la API de video.
    concurrency: env.CHAPTER_CONCURRENCY,
    lockDuration: 10 * 60_000, // un capítulo puede tardar mucho; el lock se renueva solo
  },
);
productionWorker.on("failed", async (job, err) => {
  if (!job) return;
  const { novelaId, number } = job.data;
  const last = isLastAttempt(job, err);
  await prisma.chapter.update({
    where: { novelaId_number: { novelaId, number } },
    data: { status: last ? "FAILED" : "QUEUED", error: err.message, currentStep: last ? "Error" : "Reintentando…" },
  });
  if (last) await prisma.novela.update({ where: { id: novelaId }, data: { status: "FAILED", productionMode: "NONE", error: `Capítulo ${number}: ${err.message}` } });
});

// ---------------------------------------------------------------- exportaciones
const exportWorker = new Worker<ExportJob>("export", async (job) => runExport(job.data.exportId), { connection, concurrency: 1 });
exportWorker.on("failed", async (job, err) => {
  if (job && isLastAttempt(job, err)) await prisma.export.update({ where: { id: job.data.exportId }, data: { status: "FAILED", error: err.message } });
});

console.log("🍍 FrutiNovela workers listos: script, design, production, export");

const shutdown = async () => {
  await Promise.all([scriptWorker.close(), designWorker.close(), productionWorker.close(), exportWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
