/**
 * Música de telenovela. Se genera/elige UNA pista por "mood" y por novela y se
 * reutiliza en todos los capítulos: así la banda sonora tiene leitmotivs
 * reconocibles (el tema romántico siempre suena igual), como en una telenovela real.
 *
 *  - library:    pistas con licencia en assets/music/<mood>/*.mp3 (recomendado para producción)
 *  - elevenlabs: Eleven Music (POST /v1/music) con prompts de estilo telenovela
 *  - mock:       acordes sintéticos con ffmpeg
 *
 * Suno/Udio no ofrecen API pública oficial; si tienes acceso a un proxy con
 * licencia comercial, implementa la misma interfaz `MusicProvider`.
 */
import { copyFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MusicMood } from "@fruti/shared";
import { env } from "../../config";
import { placeholderMusic } from "../../lib/ffmpeg";
import { ProviderError } from "../../lib/http";

export const MUSIC_PROMPTS: Record<MusicMood, string> = {
  dramatica: "Latin American telenovela dramatic theme, sweeping strings, timpani hits, piano ostinato, big orchestral stabs, 90s Televisa style, instrumental",
  romantica: "Romantic telenovela love theme, nylon guitar, soft strings, bolero feel, tender piano melody, instrumental",
  suspenso: "Suspense telenovela underscore, pizzicato strings, low drones, ticking percussion, mysterious, instrumental",
  comedia: "Comedic telenovela cue, playful marimba, pizzicato, bassoon, mischievous, light percussion, instrumental",
  tristeza: "Sad telenovela ballad underscore, solo cello and piano, melancholic, slow, instrumental",
  tension: "High tension telenovela confrontation cue, staccato strings, pounding drums, rising brass, instrumental",
  revelacion: "Shocking revelation sting then dramatic orchestral swell, gong, choir pad, telenovela reveal, instrumental",
  felicidad: "Happy tropical telenovela celebration, cumbia rhythm, accordion, brass, festive, instrumental",
};

export interface MusicProvider {
  track(mood: MusicMood, seconds: number, out: string): Promise<string>;
}

const library: MusicProvider = {
  async track(mood, _seconds, out) {
    const dir = path.resolve("assets/music", mood);
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".mp3"));
    if (!files.length) throw new ProviderError(`No hay pistas en ${dir}`, false);
    await copyFile(path.join(dir, files[0]), out);
    return out;
  },
};

const elevenlabs: MusicProvider = {
  async track(mood, seconds, out) {
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY ?? "", "content-type": "application/json" },
      body: JSON.stringify({ prompt: MUSIC_PROMPTS[mood], music_length_ms: Math.round(Math.min(120, Math.max(30, seconds)) * 1000) }),
    });
    if (!res.ok) throw new ProviderError(`Eleven Music ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status >= 500 || res.status === 429);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    return out;
  },
};

const BASE_HZ: Record<MusicMood, number> = {
  dramatica: 110, romantica: 196, suspenso: 82, comedia: 262, tristeza: 147, tension: 98, revelacion: 123, felicidad: 294,
};

const mock: MusicProvider = {
  track(mood, seconds, out) {
    return placeholderMusic(out, Math.max(20, seconds), BASE_HZ[mood]);
  },
};

export const musicProvider: MusicProvider = { library, elevenlabs, mock }[env.MUSIC_PROVIDER];
