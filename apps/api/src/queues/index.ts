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

/**
 * Conexión para encolar desde la API: sin cola offline, un Redis caído produce
 * un error inmediato (→ 503) en lugar de dejar la petición colgada.
 */
const producerConnection: ConnectionOptions = { ...connection, enableOfflineQueue: false, connectTimeout: 5000 };

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

export const scriptQueue = new Queue<ScriptJob, void, string>("script", { connection: producerConnection, defaultJobOptions: defaults });
export const designQueue = new Queue<DesignJob, void, string>("design", { connection: producerConnection, defaultJobOptions: defaults });
export const productionQueue = new Queue<ProductionJob, void, string>("production", {
  connection: producerConnection,
  defaultJobOptions: { ...defaults, attempts: 2, backoff: { type: "exponential", delay: 120_000 } },
});
export const exportQueue = new Queue<ExportJob, void, string>("export", { connection: producerConnection, defaultJobOptions: { ...defaults, attempts: 2 } });

// Sin listener, un evento "error" de ioredis tumbaría el proceso.
for (const q of [scriptQueue, designQueue, productionQueue, exportQueue]) {
  q.on("error", (err) => console.error(`[cola ${q.name}] ${err.message}`));
}

export class QueueUnavailableError extends Error {}

/** Latido del worker en Redis: la API lo usa para avisar si no hay ningún worker procesando. */
export const WORKER_HEARTBEAT_KEY = "fruti:worker:heartbeat";

export async function workerAlive(): Promise<boolean | null> {
  try {
    const client = await withQueue(() => scriptQueue.client, 3000);
    const last = Number(await client.get(WORKER_HEARTBEAT_KEY));
    return Number.isFinite(last) && Date.now() - last < 90_000;
  } catch {
    return null; // Redis no accesible
  }
}

/** Encola con timeout: si Redis no contesta, error claro en vez de petición colgada. */
export async function withQueue<T>(fn: () => Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new QueueUnavailableError("Redis no responde")), ms);
      }),
    ]);
  } catch (err) {
    if (err instanceof QueueUnavailableError) throw err;
    const msg = (err as Error).message ?? "";
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection is closed|enableOfflineQueue|Stream isn't writeable/i.test(msg)) {
      throw new QueueUnavailableError(`Redis no disponible: ${msg}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** jobId determinista: evita encolar dos veces el mismo capítulo por doble clic. */
export function enqueueChapter(novelaId: string, number: number, attempt: number) {
  return withQueue(() => productionQueue.add("chapter", { novelaId, number }, { jobId: `ch_${novelaId}_${number}_${attempt}` }));
}
