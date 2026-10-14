import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { ChapterScriptSchema, CreateNovelaSchema, UpdateCharacterSchema } from "@fruti/shared";
import type { StoryBible } from "@fruti/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod/v4";
import { env, envWarnings, missingEnv } from "../config";
import { prisma } from "../lib/db";
import { randomSeed } from "../lib/seed";
import { contentTypeFor, localPathFor } from "../lib/storage";
import { designQueue, withQueue, QueueUnavailableError, workerAlive } from "../queues";
import { listVoices, regenerateCharacter, updateCharacter } from "../services/characters";
import {
  ConflictError,
  pauseProduction,
  regenerateChapterScript,
  requestExport,
  startDesign,
  startProduction,
  startScript,
} from "../services/orchestrator";
import { normalizeChapter } from "../services/script";
import { chapterDTO, characterDTO, exportDTO, novelaDTO, novelaSummary } from "../services/serialize";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Sin auth completa: cada navegador manda un id anónimo. Con Supabase Auth, sustituir por el user id del JWT. */
function owner(req: FastifyRequest) {
  const id = req.headers["x-owner-id"];
  return typeof id === "string" && id.length >= 8 ? id : "anonymous";
}

async function loadNovela(req: FastifyRequest, id: string) {
  const n = await prisma.novela.findFirst({
    where: { id, ownerId: owner(req) },
    include: { characters: { include: { versions: true } }, chapters: true, exports: true },
  });
  if (!n) throw Object.assign(new Error("FrutiNovela no encontrada"), { statusCode: 404 });
  return n;
}

const IdParams = z.object({ id: z.string() });
const ChapterParams = z.object({ id: z.string(), number: z.coerce.number().int().min(1) });

export async function routes(app: FastifyInstance) {
  // Configuración incompleta → 503 explicando qué falta (antes: 500 genérico de Vercel)
  app.addHook("onRequest", async (req, reply) => {
    if (missingEnv.length && !req.url.endsWith("/health")) {
      return reply.status(503).send({ error: `Servidor sin configurar: faltan las variables ${missingEnv.join(", ")}` });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ error: "Datos inválidos", issues: err.issues });
    if (err instanceof ConflictError) return reply.status(409).send({ error: err.message });
    if (err instanceof QueueUnavailableError) {
      app.log.error(err);
      return reply.status(503).send({ error: "La cola de trabajos (Redis) no está disponible. Revisa REDIS_URL." });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2022")) {
      app.log.error(err);
      return reply.status(503).send({ error: "La base de datos no tiene las tablas: ejecuta `npm run db:deploy -w @fruti/api`." });
    }
    if (err instanceof Prisma.PrismaClientInitializationError) {
      app.log.error(err);
      return reply.status(503).send({ error: "No se puede conectar a la base de datos. Revisa DATABASE_URL." });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: err.message });
  });

  app.get("/health", async (_req, reply) => {
    const ok = missingEnv.length === 0;
    const warnings = [...envWarnings];
    let worker: boolean | null = null;
    if (ok) {
      worker = await workerAlive();
      if (worker === null) warnings.push("Redis no responde: revisa REDIS_URL");
      else if (!worker) warnings.push("No hay ningún worker conectado: las novelas no avanzarán hasta desplegar el worker (node dist/worker.js)");
    }
    return reply.status(ok ? 200 : 503).send({ ok, missing: missingEnv, warnings, worker });
  });

  // ------------------------------------------------------------------ novelas
  app.get("/novelas", async (req) => {
    const list = await prisma.novela.findMany({
      where: { ownerId: owner(req) },
      orderBy: { createdAt: "desc" },
      include: { chapters: { select: { status: true } } },
      take: 100,
    });
    return Promise.all(list.map(novelaSummary));
  });

  app.post("/novelas", async (req, reply) => {
    const input = CreateNovelaSchema.parse(req.body);
    const novela = await prisma.novela.create({
      data: { ...input, ownerId: owner(req), totalMinutes: Math.round(input.totalMinutes), masterSeed: randomSeed() },
    });
    try {
      await startScript(novela.id);
    } catch (err) {
      // Sin cola no se escribirá nunca el guion: no dejar una novela huérfana en el historial
      await prisma.novela.delete({ where: { id: novela.id } }).catch(() => {});
      throw err;
    }
    return reply.status(201).send({ id: novela.id });
  });

  app.get("/novelas/:id", async (req) => novelaDTO(await loadNovela(req, IdParams.parse(req.params).id)));

  app.patch("/novelas/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = z.object({ title: z.string().min(1).optional(), tagline: z.string().optional(), subtitles: z.boolean().optional() }).parse(req.body);
    const n = await loadNovela(req, id);
    const bible = n.bible as unknown as StoryBible | null;
    if (bible && body.title) bible.title = body.title;
    if (bible && body.tagline) bible.tagline = body.tagline;
    await prisma.novela.update({ where: { id }, data: { ...body, bible: bible ? json(bible) : undefined } });
    return novelaDTO(await loadNovela(req, id));
  });

  app.delete("/novelas/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await loadNovela(req, id);
    await prisma.novela.delete({ where: { id } });
    return reply.status(204).send();
  });

  /** Regenera la biblia y todos los guiones (borra personajes y capítulos). */
  app.post("/novelas/:id/script", async (req) => {
    const { id } = IdParams.parse(req.params);
    const n = await loadNovela(req, id);
    if (n.status === "PRODUCING") throw new ConflictError("Pausa la producción antes de regenerar el guion");
    await startScript(id);
    return { ok: true };
  });

  // ------------------------------------------------------------------ capítulos / editor de guion
  app.get("/novelas/:id/chapters/:number", async (req) => {
    const { id, number } = ChapterParams.parse(req.params);
    await loadNovela(req, id);
    const c = await prisma.chapter.findUniqueOrThrow({ where: { novelaId_number: { novelaId: id, number } }, include: { shots: true } });
    return chapterDTO(c);
  });

  app.put("/novelas/:id/chapters/:number/script", async (req) => {
    const { id, number } = ChapterParams.parse(req.params);
    const n = await loadNovela(req, id);
    const chapter = n.chapters.find((c) => c.number === number);
    if (!chapter) throw Object.assign(new Error("Capítulo no encontrado"), { statusCode: 404 });
    if (chapter.status === "RENDERING" || chapter.status === "QUEUED") throw new ConflictError("No se puede editar un capítulo mientras se produce");
    const script = normalizeChapter(ChapterScriptSchema.parse(req.body), n.bible as unknown as StoryBible, number);
    const updated = await prisma.chapter.update({
      where: { id: chapter.id },
      data: { script: json(script), title: script.title, scriptStale: chapter.status === "DONE", status: chapter.status === "DONE" ? "DONE" : "SCRIPTED" },
    });
    return chapterDTO(updated);
  });

  app.post("/novelas/:id/chapters/:number/regenerate-script", async (req) => {
    const { id, number } = ChapterParams.parse(req.params);
    const { cascade } = z.object({ cascade: z.boolean().default(false) }).parse(req.body ?? {});
    await loadNovela(req, id);
    await regenerateChapterScript(id, number, cascade);
    return { ok: true };
  });

  // ------------------------------------------------------------------ personajes
  app.post("/novelas/:id/design", async (req) => {
    const { id } = IdParams.parse(req.params);
    const { characterIds } = z.object({ characterIds: z.array(z.string()).optional() }).parse(req.body ?? {});
    await loadNovela(req, id);
    await startDesign(id, characterIds);
    return { ok: true };
  });

  const loadCharacter = async (req: FastifyRequest) => {
    const { id } = IdParams.parse(req.params);
    const c = await prisma.character.findUniqueOrThrow({ where: { id }, include: { versions: true } });
    await loadNovela(req, c.novelaId);
    return c;
  };

  app.post("/characters/:id/approve", async (req) => {
    const c = await loadCharacter(req);
    const latest = c.versions.sort((a, b) => b.version - a.version)[0];
    if (latest.status !== "READY") throw new ConflictError("El diseño aún no está listo");
    await prisma.character.update({ where: { id: c.id }, data: { approved: true } });
    return characterDTO(await prisma.character.findUniqueOrThrow({ where: { id: c.id }, include: { versions: true } }));
  });

  app.post("/characters/:id/regenerate", async (req) => {
    const c = await loadCharacter(req);
    const v = await regenerateCharacter(c.id);
    await withQueue(() => designQueue.add("character", { type: "character", versionId: v.id }));
    return { ok: true };
  });

  /** Cambiar diseño o voz (opcionalmente a partir de un capítulo concreto). */
  app.patch("/characters/:id", async (req) => {
    const c = await loadCharacter(req);
    const input = UpdateCharacterSchema.parse(req.body);
    const v = await updateCharacter(c.id, input);
    if (v) await withQueue(() => designQueue.add("character", { type: "character", versionId: v.id }));
    return characterDTO(await prisma.character.findUniqueOrThrow({ where: { id: c.id }, include: { versions: true } }));
  });

  app.get("/voices", async () => listVoices());

  // ------------------------------------------------------------------ producción
  app.post("/novelas/:id/produce", async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = z.object({ mode: z.enum(["ALL", "SINGLE"]), number: z.number().int().min(1).optional() }).parse(req.body);
    await loadNovela(req, id);
    await startProduction(id, body.mode, body.number);
    return { ok: true };
  });

  app.post("/novelas/:id/pause", async (req) => {
    const { id } = IdParams.parse(req.params);
    await loadNovela(req, id);
    await pauseProduction(id);
    return { ok: true };
  });

  // ------------------------------------------------------------------ exportaciones
  app.post("/novelas/:id/exports", async (req) => {
    const { id } = IdParams.parse(req.params);
    const { kind } = z.object({ kind: z.enum(["ZIP", "LONG_VIDEO", "VERTICAL_SERIES"]) }).parse(req.body);
    const n = await loadNovela(req, id);
    if (!n.chapters.some((c) => c.status === "DONE")) throw new ConflictError("Aún no hay capítulos terminados");
    return exportDTO(await requestExport(id, kind));
  });

  // ------------------------------------------------------------------ archivos (solo STORAGE_DRIVER=local)
  if (env.STORAGE_DRIVER === "local") {
    app.get("/files/*", async (req, reply) => serveLocal(req, reply));
  }
}

/** Sirve archivos locales con soporte de Range (necesario para hacer seek en <video>). */
async function serveLocal(req: FastifyRequest, reply: FastifyReply) {
  const key = (req.params as { "*": string })["*"];
  const file = localPathFor(key);
  if (!path.resolve(file).startsWith(path.resolve(env.LOCAL_STORAGE_DIR))) return reply.status(400).send();
  const info = await stat(file).catch(() => null);
  if (!info) return reply.status(404).send({ error: "No existe" });
  reply.header("accept-ranges", "bytes").header("content-type", contentTypeFor(key)).header("cache-control", "public, max-age=3600");
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    reply.status(206).header("content-range", `bytes ${start}-${end}/${info.size}`).header("content-length", end - start + 1);
    return reply.send(createReadStream(file, { start, end }));
  }
  reply.header("content-length", info.size);
  return reply.send(createReadStream(file));
}
