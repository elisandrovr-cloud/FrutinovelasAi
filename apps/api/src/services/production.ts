/**
 * PRODUCCIÓN DE UN CAPÍTULO (un job de la cola "production")
 *
 *  1. Planos → filas Shot (reanudable: los planos ya terminados con el mismo spec se reutilizan)
 *  2. Por escena, en serie: imagen clave encadenada (continuidad dentro de la escena)
 *  3. En paralelo (SHOT_CONCURRENCY): video i2v + voces + SFX + lip-sync + render del plano
 *  4. Ensamblado: cartela + planos + cama musical con ducking + subtítulos + "Continuará..."
 *  5. Último fotograma → ancla del capítulo siguiente; versión vertical para redes
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { ASPECT_RESOLUTIONS } from "@fruti/shared";
import type { AspectRatio, ChapterScript, MusicMood, Scene, Shot } from "@fruti/shared";
import type { Prisma, Shot as ShotRow } from "@prisma/client";
import { env } from "../config";
import { prisma } from "../lib/db";
import {
  addLabel,
  buildMusicBed,
  buildShotAudio,
  concat,
  extractLastFrame,
  extractThumbnail,
  mixWithMusic,
  probeDuration,
  renderCard,
  renderShot,
  srtToVtt,
  toSrt,
  toVertical,
  type Cue,
} from "../lib/ffmpeg";
import { ProviderError } from "../lib/http";
import { downloadTo, keys, providerImageRef, putFile, readObject, urlFor } from "../lib/storage";
import { videoMotionPrompt } from "../prompts/video";
import { settingsForLine, ttsText, DEFAULT_VOICE_SETTINGS } from "../prompts/voice";
import { imageProvider } from "../providers/image";
import { lipsyncProvider } from "../providers/lipsync";
import { musicProvider } from "../providers/music";
import { ttsProvider } from "../providers/tts";
import { videoProvider } from "../providers/video";
import { castForChapter, planKeyframe, previousChapterAnchor, shotSeed, type CastMember } from "./continuity";
import { generateChapterScript } from "./script";

export class PausedError extends Error {}

type ShotSpec = Shot & { sceneNumber: number; setKey: string; timeOfDay: Scene["timeOfDay"]; weather: string; music: Scene["music"] };

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function produceChapter(novelaId: string, number: number) {
  const novela = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId }, include: { sets: true } });
  let chapter = await prisma.chapter.findUniqueOrThrow({ where: { novelaId_number: { novelaId, number } } });
  if (!chapter.script) {
    await generateChapterScript(novelaId, number);
    chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
  }
  const script = chapter.script as unknown as ChapterScript;
  const aspect = novela.aspectRatio as AspectRatio;
  const { width: W, height: H } = ASPECT_RESOLUTIONS[aspect];
  const dir = path.resolve(env.WORK_DIR, novelaId, `ch${String(number).padStart(2, "0")}`);
  await mkdir(dir, { recursive: true });

  const progress = async (pct: number, step: string) => {
    await prisma.chapter.update({ where: { id: chapter.id }, data: { progress: Math.round(pct), currentStep: step } });
  };
  const checkPaused = async () => {
    const n = await prisma.novela.findUniqueOrThrow({ where: { id: novelaId }, select: { status: true } });
    if (n.status === "PAUSED") throw new PausedError("Producción en pausa");
  };

  await prisma.chapter.update({
    where: { id: chapter.id },
    data: { status: "RENDERING", startedAt: new Date(), error: null, attempts: { increment: 1 }, scriptStale: false },
  });
  await progress(1, "Preparando reparto y continuidad");

  const cast = await castForChapter(novelaId, number);
  const anchor = await previousChapterAnchor(novelaId, number);
  const shots = await syncShotRows(chapter.id, script);
  const names = Object.fromEntries([...cast.values()].map((c) => [c.key, c.name]));
  const narratorVoice = await narratorVoiceId(cast);

  // ---------------------------------------------------------------- 1. imágenes clave (en serie por escena)
  const byScene = new Map<number, ShotRow[]>();
  for (const s of shots) byScene.set(s.sceneNumber, [...(byScene.get(s.sceneNumber) ?? []), s]);

  let doneKeyframes = 0;
  for (const [sceneNumber, sceneShots] of byScene) {
    const scene = script.scenes.find((s) => s.number === sceneNumber)!;
    const set = novela.sets.find((s) => s.key === scene.setKey) ?? novela.sets[0];
    // El primer plano del capítulo arranca del último fotograma del capítulo anterior
    let continuityKey: string | null = sceneNumber === 1 && anchor ? anchor.imageKey : null;
    let continuityNote: string | null = sceneNumber === 1 && anchor ? anchor.note : null;
    let prevOnScreen: string[] | null = null;
    for (const row of sceneShots) {
      await checkPaused();
      const spec = row.spec as unknown as ShotSpec;
      // Dentro de la escena se encadena con el plano anterior solo si comparten personajes;
      // en un contraplano con otro personaje la referencia previa confunde al modelo.
      if (prevOnScreen && !spec.charactersOnScreen.some((k) => prevOnScreen!.includes(k))) continuityKey = null;
      if (!row.keyframeKey) {
        const plan = planKeyframe({ scene, shot: spec, setName: set?.name ?? scene.setKey, setPrompt: set?.description ?? "", setRefKey: set?.referenceImageKey ?? null, cast, continuityKey, continuityNote });
        const out = path.join(dir, `kf_${row.order}.png`);
        const label = `Cap ${number} · Escena ${sceneNumber} · Plano ${spec.number}\n${spec.action}`;
        const seed = shotSeed(novela.masterSeed, number, row.order);
        if (plan.imageKeys.length) {
          const images = await Promise.all(plan.imageKeys.map((k) => providerImageRef(k)));
          await imageProvider.editWithReferences({ prompt: plan.prompt, images, seed, aspectRatio: aspect, out, label });
        } else {
          await imageProvider.textToImage({ prompt: plan.prompt, seed, aspectRatio: aspect, out, label });
        }
        const keyframeKey = await putFile(keys.shot(novelaId, number, row.order, "keyframe.png"), out);
        Object.assign(row, await prisma.shot.update({ where: { id: row.id }, data: { keyframeKey, keyframePrompt: plan.prompt } }));
      }
      continuityKey = row.keyframeKey;
      continuityNote = null;
      prevOnScreen = spec.charactersOnScreen;
      doneKeyframes++;
      await progress(2 + (doneKeyframes / shots.length) * 18, `Imagen clave ${doneKeyframes}/${shots.length}`);
    }
  }

  // ---------------------------------------------------------------- 2. video + audio + render por plano (paralelo)
  const limit = pLimit(env.SHOT_CONCURRENCY);
  let doneShots = 0;
  const allLines = shots.flatMap((s) => (s.spec as unknown as ShotSpec).dialogue);
  await Promise.all(
    shots.map((row) =>
      limit(async () => {
        await checkPaused();
        if (!row.finalKey) await produceShot({ row, novelaId, chapter: number, aspect, W, H, cast, narratorVoice, allLines, dir, seed: shotSeed(novela.masterSeed, number, row.order) });
        doneShots++;
        await progress(20 + (doneShots / shots.length) * 65, `Plano ${doneShots}/${shots.length} animado y doblado`);
      }),
    ),
  );

  // ---------------------------------------------------------------- 3. ensamblado
  await progress(87, "Montaje, música y subtítulos");
  const fresh = await prisma.shot.findMany({ where: { chapterId: chapter.id }, orderBy: { order: "asc" } });
  const clips: string[] = [];
  const cues: Cue[] = [];
  let t = 0;
  for (const s of fresh) {
    const local = await downloadTo(s.finalKey!, path.join(dir, `final_${s.order}.mp4`));
    clips.push(local);
    for (const c of (s.cues as unknown as Cue[] | null) ?? []) cues.push({ ...c, start: c.start + t, end: c.end + t });
    t += s.durationSec ?? (await probeDuration(local));
  }
  const coreRaw = await concat(clips, path.join(dir, "core_raw.mp4"));

  // Cama musical: un tema por escena, el mismo tema por mood en toda la novela (leitmotiv)
  const segments: { file: string; duration: number }[] = [];
  for (const scene of script.scenes) {
    const dur = fresh.filter((s) => s.sceneNumber === scene.number).reduce((a, s) => a + (s.durationSec ?? 0), 0);
    if (dur > 0) segments.push({ file: await novelaMusic(novelaId, scene.music.mood, dir), duration: dur });
  }
  const music = await buildMusicBed(dir, segments);
  const srtPath = path.join(dir, "core.srt");
  await writeFile(srtPath, toSrt(cues, names));
  const core = await mixWithMusic(coreRaw, music, path.join(dir, "core.mp4"), novela.subtitles && env.BURN_SUBTITLES ? srtPath : null);
  const lastFrame = await extractLastFrame(core, path.join(dir, "last_frame.png"));

  // Cartela de apertura (con recap narrado desde el cap. 2) y "Continuará..."
  let recapAudio: string | null = null;
  if (script.recap && number > 1) {
    recapAudio = await ttsProvider.speak({ voiceId: narratorVoice, text: script.recap, settings: { stability: 0.55, similarityBoost: 0.8, style: 0.35 }, out: path.join(dir, "recap.mp3") });
  }
  const recapDur = recapAudio ? (await probeDuration(recapAudio)) + 0.8 : 0;
  const prevFrame = anchor ? await downloadTo(anchor.imageKey, path.join(dir, "prev_last.png")) : undefined;
  const titleDur = Math.max(3, recapDur);
  const title = await renderCard({ workDir: dir, name: "title", title: novela.title, subtitle: `Capítulo ${number}: ${script.title}`, background: prevFrame, audio: recapAudio, duration: titleDur, w: W, h: H });
  const isFinal = number === novela.chapterCount;
  const endCard = await renderCard({
    workDir: dir,
    name: "end",
    title: isFinal ? "FIN" : "Continuará...",
    subtitle: isFinal ? novela.tagline ?? undefined : `Capítulo ${number + 1} muy pronto`,
    background: lastFrame,
    audio: await novelaMusic(novelaId, isFinal ? "felicidad" : "revelacion", dir),
    duration: 3,
    w: W,
    h: H,
  });
  const master = await concat([title, core, endCard], path.join(dir, "master.mp4"));
  const masterSrt = toSrt(cues.map((c) => ({ ...c, start: c.start + titleDur, end: c.end + titleDur })), names);
  await writeFile(path.join(dir, "master.srt"), masterSrt);
  await writeFile(path.join(dir, "master.vtt"), srtToVtt(masterSrt));

  await progress(95, "Versión para TikTok / Reels / Shorts");
  const label = `Parte ${number}/${novela.chapterCount}`;
  const vertical = aspect === "9:16" ? await addLabel(master, path.join(dir, "vertical.mp4"), label, dir) : await toVertical(master, path.join(dir, "vertical.mp4"), label, dir);
  const thumb = await extractThumbnail(core, path.join(dir, "thumb.jpg"), Math.min(3, t / 2));

  const [videoKey, verticalKey, subtitlesKey, , lastFrameKey, thumbnailKey] = await Promise.all([
    putFile(keys.chapter(novelaId, number, "master.mp4"), master),
    putFile(keys.chapter(novelaId, number, "vertical.mp4"), vertical),
    putFile(keys.chapter(novelaId, number, "master.srt"), path.join(dir, "master.srt")),
    putFile(keys.chapter(novelaId, number, "master.vtt"), path.join(dir, "master.vtt")),
    putFile(keys.chapter(novelaId, number, "last_frame.png"), lastFrame),
    putFile(keys.chapter(novelaId, number, "thumb.jpg"), thumb),
    putFile(keys.chapter(novelaId, number, "core.mp4"), core),
    putFile(keys.chapter(novelaId, number, "core.srt"), srtPath),
  ]);
  const durationSec = await probeDuration(master);
  await prisma.chapter.update({
    where: { id: chapter.id },
    data: { status: "DONE", progress: 100, currentStep: null, videoKey, verticalKey, subtitlesKey, lastFrameKey, thumbnailKey, durationSec, finishedAt: new Date() },
  });
  if (number === 1) await prisma.novela.update({ where: { id: novelaId }, data: { coverKey: thumbnailKey } });
  await rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

async function produceShot(p: {
  row: ShotRow;
  novelaId: string;
  chapter: number;
  aspect: AspectRatio;
  W: number;
  H: number;
  cast: Map<string, CastMember>;
  narratorVoice: string;
  allLines: Shot["dialogue"];
  dir: string;
  seed: number;
}) {
  const { row } = p;
  const spec = row.spec as unknown as ShotSpec;
  const sdir = path.join(p.dir, `shot_${row.order}`);
  await mkdir(sdir, { recursive: true });
  const keyframe = await downloadTo(row.keyframeKey!, path.join(sdir, "keyframe.png"));

  // --- video (con degradación elegante: si el proveedor falla de forma no recuperable, Ken Burns sobre la imagen clave)
  let videoKey = row.videoKey;
  let videoLocal: string | null = videoKey ? await downloadTo(videoKey, path.join(sdir, "video.mp4")) : null;
  let error: string | null = null;
  const speaking = [...new Set(spec.dialogue.map((d) => d.characterKey).filter((k) => k !== "narrador" && spec.charactersOnScreen.includes(k)))];
  if (!videoLocal) {
    const prompt = videoMotionPrompt({ shot: spec, speaking });
    try {
      videoLocal = await videoProvider.imageToVideo({
        imageRef: await providerImageRef(row.keyframeKey!),
        imagePath: keyframe,
        prompt,
        duration: spec.durationSec >= 8 ? 10 : 5,
        aspectRatio: p.aspect,
        seed: p.seed,
        out: path.join(sdir, "video.mp4"),
        onTaskId: async (id) => {
          await prisma.shot.update({ where: { id: row.id }, data: { providerTaskId: id, provider: videoProvider.name } });
        },
      });
      videoKey = await putFile(keys.shot(p.novelaId, p.chapter, row.order, "video.mp4"), videoLocal);
      await prisma.shot.update({ where: { id: row.id }, data: { videoKey, videoPrompt: prompt } });
    } catch (err) {
      if (err instanceof ProviderError && err.retryable) throw err; // BullMQ reintenta el capítulo (los planos hechos se reutilizan)
      error = `Video no disponible, se usa imagen animada: ${(err as Error).message}`;
      videoLocal = null;
    }
  }

  // --- voces (una por réplica, con contexto de prosodia) + SFX
  const lines: { file: string; text: string; characterKey: string }[] = [];
  for (const [i, line] of spec.dialogue.entries()) {
    const member = p.cast.get(line.characterKey);
    const globalIdx = p.allLines.indexOf(line);
    const file = await ttsProvider.speak({
      voiceId: member?.voiceId ?? p.narratorVoice,
      text: ttsText(line, env.ELEVENLABS_MODEL),
      settings: settingsForLine(member?.voiceSettings ?? DEFAULT_VOICE_SETTINGS, line),
      previousText: spec.dialogue[i - 1]?.text ?? p.allLines[globalIdx - 1]?.text,
      nextText: spec.dialogue[i + 1]?.text,
      seed: member?.seed,
      out: path.join(sdir, `line_${i}.mp3`),
    });
    lines.push({ file, text: line.text, characterKey: line.characterKey });
  }
  const sfx: string[] = [];
  for (const [j, s] of spec.sfx.slice(0, 2).entries()) {
    try {
      sfx.push(await ttsProvider.soundEffect(`${s}, cartoon telenovela sound effect`, 2, path.join(sdir, `sfx_${j}.mp3`)));
    } catch {
      /* un SFX fallido no debe tumbar el capítulo */
    }
  }
  const audio = await buildShotAudio(sdir, lines, sfx);
  const duration = Math.max(spec.durationSec, audio.duration);

  // --- lip-sync (solo si hay un único hablante en pantalla: es donde el resultado es fiable)
  if (videoLocal && audio.file && lipsyncProvider.enabled && speaking.length === 1) {
    try {
      const aKey = await putFile(keys.shot(p.novelaId, p.chapter, row.order, "audio.wav"), audio.file);
      const synced = await lipsyncProvider.sync({ videoUrl: (await urlFor(videoKey))!, audioUrl: (await urlFor(aKey))!, out: path.join(sdir, "lipsync.mp4") });
      const lipsyncKey = await putFile(keys.shot(p.novelaId, p.chapter, row.order, "lipsync.mp4"), synced);
      await prisma.shot.update({ where: { id: row.id }, data: { lipsyncKey, audioKey: aKey } });
      videoLocal = synced;
    } catch (err) {
      error = `Lip-sync omitido: ${(err as Error).message}`;
    }
  }

  // --- render a formato intermedio
  const final = await renderShot({
    video: videoLocal,
    still: keyframe,
    audio: audio.file,
    duration,
    w: p.W,
    h: p.H,
    fadeIn: row.order === 1,
    fadeOut: spec.transitionOut === "fundido_negro" || spec.transitionOut === "flash_blanco" ? spec.transitionOut : null,
    out: path.join(sdir, "final.mp4"),
  });
  const finalKey = await putFile(keys.shot(p.novelaId, p.chapter, row.order, "final.mp4"), final);
  await prisma.shot.update({
    where: { id: row.id },
    data: { finalKey, durationSec: await probeDuration(final), cues: json(audio.cues), status: "READY", error },
  });
}

/** Crea/reutiliza filas Shot. Si el spec de un plano no cambió y ya está renderizado, se conserva (reanudación). */
async function syncShotRows(chapterId: string, script: ChapterScript) {
  const specs: { order: number; sceneNumber: number; shotNumber: number; spec: ShotSpec }[] = [];
  let order = 0;
  for (const scene of script.scenes) {
    for (const shot of scene.shots) {
      order++;
      specs.push({
        order,
        sceneNumber: scene.number,
        shotNumber: shot.number,
        spec: { ...shot, sceneNumber: scene.number, setKey: scene.setKey, timeOfDay: scene.timeOfDay, weather: scene.weather, music: scene.music },
      });
    }
  }
  const existing = await prisma.shot.findMany({ where: { chapterId } });
  const byOrder = new Map(existing.map((s) => [s.order, s]));
  await prisma.shot.deleteMany({ where: { chapterId, order: { gt: specs.length } } });

  const rows: ShotRow[] = [];
  let invalidateRest = false; // si cambia un plano, las imágenes clave encadenadas posteriores de esa escena dejan de valer
  let lastScene = 0;
  for (const s of specs) {
    if (s.sceneNumber !== lastScene) {
      invalidateRest = false;
      lastScene = s.sceneNumber;
    }
    const prev = byOrder.get(s.order);
    const same = prev && canonical(prev.spec) === canonical(s.spec);
    if (prev && same && !invalidateRest) {
      rows.push(prev);
      continue;
    }
    invalidateRest = true;
    const data = { sceneNumber: s.sceneNumber, shotNumber: s.shotNumber, spec: json(s.spec), keyframeKey: null, videoKey: null, audioKey: null, lipsyncKey: null, finalKey: null, cues: undefined, status: "PENDING" as const, error: null };
    rows.push(prev ? await prisma.shot.update({ where: { id: prev.id }, data }) : await prisma.shot.create({ data: { ...data, chapterId, order: s.order } }));
  }
  return rows;
}

/** JSON con claves ordenadas: JSONB de Postgres no conserva el orden de las claves. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Una pista por mood y por novela, generada una vez y reutilizada (leitmotiv). */
async function novelaMusic(novelaId: string, mood: MusicMood, dir: string) {
  const key = `novelas/${novelaId}/music/${mood}.mp3`;
  const local = path.join(dir, `music_${mood}.mp3`);
  try {
    await readObject(key);
    return downloadTo(key, local);
  } catch {
    const file = await musicProvider.track(mood, 90, local);
    await putFile(key, file);
    return file;
  }
}

async function narratorVoiceId(cast: Map<string, CastMember>) {
  if (process.env.NARRATOR_VOICE_ID) return process.env.NARRATOR_VOICE_ID;
  const used = new Set([...cast.values()].map((c) => c.voiceId));
  const voices = await ttsProvider.listVoices();
  const narrator =
    voices.find((v) => /narrat|documentary|deep/i.test(Object.values(v.labels).join(" ")) && !used.has(v.id)) ??
    voices.find((v) => !used.has(v.id)) ??
    voices[0];
  return narrator.id;
}
