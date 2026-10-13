/**
 * Exportaciones:
 *  ZIP              → todos los capítulos (master + vertical + .srt), guion, biblia y diseños
 *  LONG_VIDEO       → un único video de ~20 min: cartela inicial + capítulos sin cartelas intermedias + FIN
 *  VERTICAL_SERIES  → ZIP con las partes 9:16 numeradas + captions.txt con textos/hashtags para publicar
 */
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { ASPECT_RESOLUTIONS } from "@fruti/shared";
import type { AspectRatio, ChapterScript, StoryBible } from "@fruti/shared";
import { env } from "../config";
import { prisma } from "../lib/db";
import { concat, renderCard } from "../lib/ffmpeg";
import { downloadTo, keys, putFile } from "../lib/storage";

export async function runExport(exportId: string) {
  const exp = await prisma.export.update({ where: { id: exportId }, data: { status: "RUNNING", error: null } });
  const novela = await prisma.novela.findUniqueOrThrow({
    where: { id: exp.novelaId },
    include: { chapters: { orderBy: { number: "asc" } }, characters: { include: { versions: true } } },
  });
  const done = novela.chapters.filter((c) => c.status === "DONE" && c.videoKey);
  if (!done.length) throw new Error("No hay capítulos terminados para exportar");
  const dir = path.resolve(env.WORK_DIR, novela.id, `export_${exp.id}`);
  await mkdir(dir, { recursive: true });
  const slug = novela.title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");

  let fileKey: string;
  if (exp.kind === "LONG_VIDEO") {
    const { width: w, height: h } = ASPECT_RESOLUTIONS[novela.aspectRatio as AspectRatio];
    const parts = [await renderCard({ workDir: dir, name: "open", title: novela.title, subtitle: novela.tagline ?? undefined, duration: 4, w, h })];
    for (const c of done) {
      const card = await renderCard({ workDir: dir, name: `ch${c.number}`, title: `Capítulo ${c.number}`, subtitle: c.title, duration: 2, w, h });
      parts.push(card, await downloadTo(keys.chapter(novela.id, c.number, "core.mp4"), path.join(dir, `core_${c.number}.mp4`)));
    }
    parts.push(await renderCard({ workDir: dir, name: "fin", title: "FIN", subtitle: "Una FrutiNovela AI", duration: 4, w, h }));
    const out = await concat(parts, path.join(dir, `${slug}_completa.mp4`));
    fileKey = await putFile(keys.export(novela.id, `${slug}_completa_${exp.id}.mp4`), out);
  } else {
    const zipPath = path.join(dir, `${slug}.zip`);
    const zip = archiver("zip", { zlib: { level: 3 } });
    const stream = createWriteStream(zipPath);
    zip.pipe(stream);
    const nn = (n: number) => String(n).padStart(2, "0");

    for (const c of done) {
      if (exp.kind === "ZIP") {
        zip.file(await downloadTo(c.videoKey!, path.join(dir, `m${c.number}.mp4`)), { name: `capitulos/${nn(c.number)}_${c.title}.mp4` });
        if (c.subtitlesKey) zip.file(await downloadTo(c.subtitlesKey, path.join(dir, `s${c.number}.srt`)), { name: `capitulos/${nn(c.number)}_${c.title}.srt` });
      }
      if (c.verticalKey) zip.file(await downloadTo(c.verticalKey, path.join(dir, `v${c.number}.mp4`)), { name: `vertical/${slug}_parte_${nn(c.number)}.mp4` });
    }

    if (exp.kind === "ZIP") {
      zip.append(JSON.stringify(novela.bible, null, 2), { name: "guion/biblia.json" });
      for (const c of novela.chapters) if (c.script) zip.append(JSON.stringify(c.script, null, 2), { name: `guion/capitulo_${nn(c.number)}.json` });
      zip.append(screenplay(novela.bible as unknown as StoryBible, novela.chapters.map((c) => c.script as unknown as ChapterScript | null)), { name: "guion/guion.txt" });
      for (const ch of novela.characters) {
        for (const v of ch.versions.filter((x) => x.referenceImageKey)) {
          zip.file(await downloadTo(v.referenceImageKey!, path.join(dir, `${ch.key}_v${v.version}.png`)), { name: `personajes/${ch.key}_v${v.version}.png` });
        }
      }
    }
    zip.append(captions(novela.title, novela.tagline, done), { name: "vertical/captions.txt" });
    await zip.finalize();
    await new Promise<void>((resolve, reject) => {
      stream.on("close", resolve);
      stream.on("error", reject);
    });
    fileKey = await putFile(keys.export(novela.id, `${slug}_${exp.kind.toLowerCase()}_${exp.id}.zip`), zipPath);
  }
  await prisma.export.update({ where: { id: exp.id }, data: { status: "DONE", fileKey } });
  await rm(dir, { recursive: true, force: true });
}

function captions(title: string, tagline: string | null, chapters: { number: number; title: string }[]) {
  const tag = "#" + title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "");
  return chapters
    .map((c) => `PARTE ${c.number}/${chapters.length} — ${c.title}\n${tagline ?? ""}\n${tag} #frutinovela #telenovela #drama #ia #fyp #parati\n`)
    .join("\n");
}

function screenplay(bible: StoryBible, scripts: (ChapterScript | null)[]) {
  const names = Object.fromEntries(bible.characters.map((c) => [c.key, c.name]));
  const out: string[] = [`${bible.title.toUpperCase()}\n${bible.tagline}\n\n${bible.logline}\n`];
  for (const s of scripts) {
    if (!s) continue;
    out.push(`\n==================== CAPÍTULO ${s.number}: ${s.title} ====================\n`);
    if (s.recap) out.push(`NARRADOR (V.O.): ${s.recap}\n`);
    for (const sc of s.scenes) {
      out.push(`\nESCENA ${sc.number} — ${sc.setKey.toUpperCase()} — ${sc.timeOfDay.toUpperCase()}  [música: ${sc.music.mood}]\n${sc.description}\n`);
      for (const sh of sc.shots) {
        out.push(`  (${sh.number}) [${sh.camera}, ${sh.durationSec}s] ${sh.action}`);
        for (const d of sh.dialogue) out.push(`      ${(names[d.characterKey] ?? d.characterKey).toUpperCase()} (${d.emotion}): ${d.text}`);
        if (sh.sfx.length) out.push(`      SFX: ${sh.sfx.join(", ")}`);
      }
    }
    if (s.cliffhanger) out.push(`\n>>> ${s.cliffhanger}\n`);
  }
  return out.join("\n");
}
