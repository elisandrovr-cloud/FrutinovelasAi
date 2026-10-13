/**
 * Toda la post-producción se hace con ffmpeg (sin dependencias nativas extra):
 *  - render de cada plano a un formato intermedio uniforme (WxH, 30 fps, AAC 48k)
 *  - concatenación de planos, cartelas de título y "Continuará..."
 *  - cama musical por escena con ducking bajo los diálogos (sidechain)
 *  - subtítulos SRT (y quemado opcional)
 *  - extracción del último fotograma (ancla de continuidad)
 *  - placeholders para el modo "mock"
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config";

export const FPS = 30;
const AUDIO = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];
const VIDEO = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS)];
const FONT = process.env.FONT_FILE ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

export function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${path.basename(bin)} salió con ${code}: ${err.slice(-1500)}`)),
    );
  });
}

export const ffmpeg = (args: string[]) => run(env.FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export async function probeDuration(file: string): Promise<number> {
  const out = await run(env.FFPROBE_PATH, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Number.parseFloat(out.trim()) || 0;
}

/** drawtext con textfile= evita todos los problemas de escape de comillas y dos puntos. */
async function drawtext(workDir: string, name: string, text: string, opts: string) {
  const file = path.join(workDir, `${name}.txt`);
  await writeFile(file, text, "utf8");
  return `drawtext=fontfile=${FONT}:textfile=${file}:${opts}`;
}

// ---------------------------------------------------------------------------
// Placeholders (modo mock): permiten probar el pipeline completo sin APIs
// ---------------------------------------------------------------------------

export async function placeholderImage(out: string, w: number, h: number, color: string, label: string) {
  await mkdir(path.dirname(out), { recursive: true });
  const dt = await drawtext(path.dirname(out), path.basename(out, ".png") + "_label", wrap(label, 28), `fontcolor=white:fontsize=${Math.round(w / 22)}:x=(w-tw)/2:y=(h-th)/2:line_spacing=12:box=1:boxcolor=black@0.35:boxborderw=24`);
  await ffmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h}`, "-vf", dt, "-frames:v", "1", out]);
  return out;
}

/** Video placeholder: Ken Burns sobre la imagen clave. */
export async function placeholderVideoFromImage(image: string, out: string, seconds: number, w: number, h: number) {
  await ffmpeg([
    "-loop", "1", "-i", image,
    "-vf", `scale=${w * 2}:${h * 2},zoompan=z='min(zoom+0.0012,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(seconds * FPS)}:s=${w}x${h}:fps=${FPS}`,
    "-t", String(seconds), ...VIDEO, "-an", out,
  ]);
  return out;
}

/** Audio placeholder: tono suave con duración proporcional al texto. */
export async function placeholderSpeech(out: string, text: string, pitchHz: number) {
  const seconds = Math.max(1.2, text.split(/\s+/).length * 0.38);
  await ffmpeg([
    "-f", "lavfi", "-i", `sine=frequency=${pitchHz}:duration=${seconds}`,
    "-af", `volume=0.15,afade=t=in:d=0.05,afade=t=out:st=${seconds - 0.1}:d=0.1`,
    "-ar", "44100", "-ac", "1", out,
  ]);
  return out;
}

export async function placeholderMusic(out: string, seconds: number, baseHz: number) {
  await ffmpeg([
    "-f", "lavfi", "-i", `sine=frequency=${baseHz}:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=${baseHz * 1.5}:duration=${seconds}`,
    "-filter_complex", "[0][1]amix=inputs=2,volume=0.25,tremolo=f=2:d=0.4",
    "-ar", "48000", "-ac", "2", out,
  ]);
  return out;
}

// ---------------------------------------------------------------------------
// Audio por plano
// ---------------------------------------------------------------------------

export interface Cue {
  start: number;
  end: number;
  text: string;
  characterKey: string;
}

/**
 * Concatena las líneas de diálogo del plano con pausas dramáticas y mezcla los
 * SFX al inicio. Devuelve los timings de cada línea (para subtítulos).
 */
export async function buildShotAudio(
  workDir: string,
  lines: { file: string; text: string; characterKey: string }[],
  sfx: string[],
  opts: { leadIn?: number; gap?: number } = {},
): Promise<{ file: string | null; duration: number; cues: Cue[] }> {
  if (!lines.length && !sfx.length) return { file: null, duration: 0, cues: [] };
  const leadIn = opts.leadIn ?? 0.35;
  const gap = opts.gap ?? 0.3;
  const cues: Cue[] = [];
  let t = leadIn;
  const inputs: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];

  for (const [i, line] of lines.entries()) {
    const d = await probeDuration(line.file);
    cues.push({ start: t, end: t + d, text: line.text, characterKey: line.characterKey });
    inputs.push("-i", line.file);
    const ms = Math.round(t * 1000);
    filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[l${i}]`);
    labels.push(`[l${i}]`);
    t += d + gap;
  }
  for (const [j, file] of sfx.entries()) {
    const idx = lines.length + j;
    inputs.push("-i", file);
    const ms = Math.round((0.1 + j * 0.8) * 1000);
    filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.55,adelay=${ms}|${ms}[s${j}]`);
    labels.push(`[s${j}]`);
  }
  const out = path.join(workDir, "shot_audio.wav");
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0[a]`);
  await ffmpeg([...inputs, "-filter_complex", filters.join(";"), "-map", "[a]", "-ar", "48000", "-ac", "2", out]);
  const duration = Math.max(t - gap + 0.25, await probeDuration(out));
  return { file: out, duration, cues };
}

// ---------------------------------------------------------------------------
// Render de plano a formato intermedio
// ---------------------------------------------------------------------------

export async function renderShot(p: {
  video: string | null;
  still: string;
  audio: string | null;
  duration: number;
  w: number;
  h: number;
  fadeIn?: boolean;
  fadeOut?: "fundido_negro" | "flash_blanco" | null;
  out: string;
}) {
  const d = Math.max(1, p.duration);
  const fades: string[] = [];
  if (p.fadeIn) fades.push("fade=t=in:st=0:d=0.4");
  if (p.fadeOut === "fundido_negro") fades.push(`fade=t=out:st=${(d - 0.5).toFixed(2)}:d=0.5`);
  if (p.fadeOut === "flash_blanco") fades.push(`fade=t=out:st=${(d - 0.25).toFixed(2)}:d=0.25:c=white`);
  const fit = `scale=${p.w}:${p.h}:force_original_aspect_ratio=increase,crop=${p.w}:${p.h},setsar=1`;

  const args: string[] = [];
  let vf: string;
  if (p.video) {
    args.push("-i", p.video);
    // Si el diálogo dura más que el clip, se congela el último cuadro (no se repite en bucle).
    vf = `[0:v]${fit},fps=${FPS},tpad=stop_mode=clone:stop_duration=${Math.ceil(d)},trim=duration=${d.toFixed(3)},setpts=PTS-STARTPTS`;
  } else {
    args.push("-loop", "1", "-i", p.still);
    vf = `[0:v]scale=${p.w * 2}:${p.h * 2}:force_original_aspect_ratio=increase,crop=${p.w * 2}:${p.h * 2},zoompan=z='min(zoom+0.0008,1.12)':d=${Math.round(d * FPS)}:s=${p.w}x${p.h}:fps=${FPS},trim=duration=${d.toFixed(3)}`;
  }
  if (fades.length) vf += "," + fades.join(",");
  vf += "[v]";

  if (p.audio) args.push("-i", p.audio);
  else args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  const af = `[1:a]aresample=48000,apad,atrim=duration=${d.toFixed(3)}[a]`;

  await ffmpeg([...args, "-filter_complex", `${vf};${af}`, "-map", "[v]", "-map", "[a]", "-t", d.toFixed(3), ...VIDEO, ...AUDIO, p.out]);
  return p.out;
}

/** Cartela de título / "Continuará..." / "FIN". */
export async function renderCard(p: {
  workDir: string;
  name: string;
  title: string;
  subtitle?: string;
  background?: string; // imagen opcional (último fotograma difuminado)
  audio?: string | null;
  duration: number;
  w: number;
  h: number;
}) {
  const out = path.join(p.workDir, `${p.name}.mp4`);
  const t1 = await drawtext(p.workDir, `${p.name}_t1`, wrap(p.title, 22), `fontcolor=#FFE066:fontsize=${Math.round(p.w / 13)}:x=(w-tw)/2:y=(h-th)/2-${Math.round(p.h / 14)}:shadowcolor=black@0.7:shadowx=4:shadowy=4:line_spacing=10`);
  const t2 = p.subtitle
    ? "," + (await drawtext(p.workDir, `${p.name}_t2`, wrap(p.subtitle, 30), `fontcolor=white:fontsize=${Math.round(p.w / 24)}:x=(w-tw)/2:y=(h/2)+${Math.round(p.h / 18)}:shadowcolor=black@0.7:shadowx=3:shadowy=3:line_spacing=8`))
    : "";
  const args: string[] = [];
  let base: string;
  if (p.background) {
    args.push("-loop", "1", "-i", p.background);
    base = `[0:v]scale=${p.w}:${p.h}:force_original_aspect_ratio=increase,crop=${p.w}:${p.h},boxblur=18:2,eq=brightness=-0.25,setsar=1,fps=${FPS}`;
  } else {
    args.push("-f", "lavfi", "-i", `color=c=#3b0a45:s=${p.w}x${p.h}:r=${FPS}`);
    base = `[0:v]vignette,setsar=1`;
  }
  if (p.audio) args.push("-i", p.audio);
  else args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  const d = p.duration.toFixed(3);
  const vf = `${base},${t1}${t2},fade=t=in:d=0.3,fade=t=out:st=${(p.duration - 0.3).toFixed(2)}:d=0.3,trim=duration=${d}[v]`;
  const af = `[1:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${d}[a]`;
  await ffmpeg([...args, "-filter_complex", `${vf};${af}`, "-map", "[v]", "-map", "[a]", "-t", d, ...VIDEO, ...AUDIO, out]);
  return out;
}

/** Concatena clips con el mismo formato intermedio (sin recodificar). */
export async function concat(files: string[], out: string) {
  const list = path.join(path.dirname(out), `${path.basename(out)}.txt`);
  await writeFile(list, files.map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
  return out;
}

/** Cama musical: un tema por escena, recortado a la duración de la escena, con fundidos. */
export async function buildMusicBed(workDir: string, segments: { file: string; duration: number }[]) {
  const inputs: string[] = [];
  const parts: string[] = [];
  segments.forEach((s, i) => {
    inputs.push("-stream_loop", "-1", "-i", s.file);
    const d = Math.max(0.5, s.duration);
    parts.push(
      `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${d.toFixed(3)},afade=t=in:d=0.8,afade=t=out:st=${Math.max(0, d - 1).toFixed(2)}:d=1[m${i}]`,
    );
  });
  const out = path.join(workDir, "music_bed.wav");
  const labels = segments.map((_, i) => `[m${i}]`).join("");
  await ffmpeg([...inputs, "-filter_complex", `${parts.join(";")};${labels}concat=n=${segments.length}:v=0:a=1[a]`, "-map", "[a]", out]);
  return out;
}

/** Mezcla final: música con ducking automático bajo diálogos + normalización -14 LUFS (redes sociales). */
export async function mixWithMusic(video: string, music: string, out: string, burnSrt?: string | null) {
  const filter =
    `[0:a]asplit=2[dlg][key];` +
    `[1:a]volume=0.32[mus];` +
    `[mus][key]sidechaincompress=threshold=0.04:ratio=8:attack=15:release=350[duck];` +
    `[dlg][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
  const args = ["-i", video, "-i", music, "-filter_complex", filter, "-map", "0:v", "-map", "[a]"];
  if (burnSrt) {
    args.push("-vf", `subtitles=${burnSrt}:force_style='Fontname=DejaVu Sans,Bold=1,Fontsize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,MarginV=40'`, ...VIDEO);
  } else {
    args.push("-c:v", "copy");
  }
  await ffmpeg([...args, ...AUDIO, "-movflags", "+faststart", out]);
  return out;
}

export async function extractLastFrame(video: string, out: string) {
  await ffmpeg(["-sseof", "-0.2", "-i", video, "-update", "1", "-frames:v", "1", "-q:v", "2", out]);
  return out;
}

export async function extractThumbnail(video: string, out: string, at = 3) {
  await ffmpeg(["-ss", String(at), "-i", video, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "3", out]);
  return out;
}

/** Versión 9:16 para TikTok/Reels/Shorts a partir de un master 16:9 (fondo difuminado). */
export async function toVertical(input: string, out: string, label: string, workDir: string) {
  const dt = await drawtext(workDir, "vertical_label", label, "fontcolor=white:fontsize=46:x=(w-tw)/2:y=140:box=1:boxcolor=#c2185b@0.85:boxborderw=18");
  const filter =
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:3[bg];` +
    `[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${dt}[v]`;
  await ffmpeg(["-i", input, "-filter_complex", filter, "-map", "[v]", "-map", "0:a", ...VIDEO, ...AUDIO, "-movflags", "+faststart", out]);
  return out;
}

export async function addLabel(input: string, out: string, label: string, workDir: string) {
  const dt = await drawtext(workDir, "label", label, "fontcolor=white:fontsize=44:x=(w-tw)/2:y=120:box=1:boxcolor=#c2185b@0.85:boxborderw=16");
  await ffmpeg(["-i", input, "-vf", dt, ...VIDEO, "-c:a", "copy", "-movflags", "+faststart", out]);
  return out;
}

export function toSrt(cues: Cue[], names: Record<string, string>) {
  const ts = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    return `${pad(h)}:${pad(m)}:${pad(sec)},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues
    .map((c, i) => {
      const who = c.characterKey === "narrador" ? "" : `${names[c.characterKey] ?? c.characterKey}: `;
      return `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${who}${c.text}\n`;
    })
    .join("\n");
}

/** WebVTT para el <track> del reproductor (los navegadores no leen .srt). */
export function srtToVtt(srt: string) {
  return "WEBVTT\n\n" + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}

const pad = (n: number) => String(n).padStart(2, "0");

function wrap(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}
