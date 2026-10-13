/**
 * Colas BullMQ (Redis).
 *
 *  script      → biblia + guiones de capítulo encadenados (cap N necesita endState de N-1)
 *  design      → hojas de personaje y escenarios (paralelo, concurrencia 3)
 *  production  → un job = un capítulo completo. Encadenado: al terminar el cap N
 *                se encola el N+1 si productionMode = ALL. Así nunca hay dos capítulos
 *                de la misma novela renderizándose a la vez (el N+1 necesita el último
 *                fotograma del N) y no se satura la API de video.
 *  export      → ZIP, video largo, serie vertical
 */
import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import { env } from "../config";

const redisUrl = new URL(env.REDIS_URL);
export const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
  db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined, // Upstash / Redis gestionado
  maxRetriesPerRequest: null,
};

export type ScriptJob = { type: "bible"; novelaId: string } | { type: "chapter-script"; novelaId: string; number: number; chain: boolean };
export type DesignJob = { type: "character"; versionId: string } | { type: "set"; setId: string };
export type ProductionJob = { novelaId: string; number: number };
export type ExportJob = { exportId: string };

const defaults: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
  removeOnFail: { age: 14 * 24 * 3600 },
};

export const scriptQueue = new Queue<ScriptJob, void, string>("script", { connection, defaultJobOptions: defaults });
export const designQueue = new Queue<DesignJob, void, string>("design", { connection, defaultJobOptions: defaults });
export const productionQueue = new Queue<ProductionJob, void, string>("production", {
  connection,
  defaultJobOptions: { ...defaults, attempts: 2, backoff: { type: "exponential", delay: 120_000 } },
});
export const exportQueue = new Queue<ExportJob, void, string>("export", { connection, defaultJobOptions: { ...defaults, attempts: 2 } });

/** jobId determinista: evita encolar dos veces el mismo capítulo por doble clic. */
export function enqueueChapter(novelaId: string, number: number, attempt: number) {
  return productionQueue.add("chapter", { novelaId, number }, { jobId: `ch_${novelaId}_${number}_${attempt}` });
}
