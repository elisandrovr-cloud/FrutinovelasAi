/**
 * Video image-to-video. Siempre partimos de una imagen clave (consistencia de
 * personajes) y pedimos solo movimiento.
 *  - Runway Gen-4 Turbo  (POST /v1/image_to_video → GET /v1/tasks/:id)
 *  - Kling 2.x           (POST /v1/videos/image2video → GET .../:task_id, auth JWT HS256)
 *  - mock                (Ken Burns con ffmpeg sobre la imagen clave)
 */
import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { ASPECT_RESOLUTIONS, NEGATIVE_STYLE } from "@fruti/shared";
import type { AspectRatio } from "@fruti/shared";
import { env } from "../../config";
import { placeholderVideoFromImage } from "../../lib/ffmpeg";
import { jsonFetch, pollUntil, ProviderError } from "../../lib/http";

export interface ImageToVideoInput {
  /** URL pública o data URI de la imagen clave. */
  imageRef: string;
  /** Ruta local de la imagen clave (la usa el mock). */
  imagePath: string;
  prompt: string;
  duration: 5 | 10;
  aspectRatio: AspectRatio;
  seed: number;
  out: string;
  onTaskId?: (id: string) => Promise<void>;
}

export interface VideoProvider {
  name: string;
  imageToVideo(i: ImageToVideoInput): Promise<string>;
}

async function download(url: string, out: string) {
  const res = await fetch(url);
  if (!res.ok) throw new ProviderError(`Descarga de video fallida ${res.status}`, true);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

// --------------------------------------------------------------------------- Runway

const RUNWAY = "https://api.dev.runwayml.com/v1";

const runway: VideoProvider = {
  name: "runway",
  async imageToVideo(i) {
    if (!env.RUNWAY_API_KEY) throw new ProviderError("RUNWAY_API_KEY no configurada", false);
    const headers = { Authorization: `Bearer ${env.RUNWAY_API_KEY}`, "X-Runway-Version": "2024-11-06" };
    const task = await jsonFetch<{ id: string }>(`${RUNWAY}/image_to_video`, {
      method: "POST",
      headers,
      json: {
        model: env.RUNWAY_MODEL,
        promptImage: i.imageRef,
        promptText: i.prompt,
        ratio: ASPECT_RESOLUTIONS[i.aspectRatio].runwayRatio,
        duration: i.duration,
        seed: i.seed,
      },
    });
    await i.onTaskId?.(task.id);
    const url = await pollUntil(
      async () => {
        const t = await jsonFetch<{ status: string; output?: string[]; failure?: string; failureCode?: string }>(`${RUNWAY}/tasks/${task.id}`, { headers });
        if (t.status === "SUCCEEDED" && t.output?.[0]) return t.output[0];
        if (t.status === "FAILED" || t.status === "CANCELLED") {
          // SAFETY.* no se reintenta igual: hay que cambiar el prompt
          throw new ProviderError(`Runway: ${t.failure ?? t.status} ${t.failureCode ?? ""}`, !String(t.failureCode).startsWith("SAFETY"));
        }
        return null;
      },
      { label: "Runway", timeoutMs: 20 * 60_000 },
    );
    return download(url, i.out);
  },
};

// --------------------------------------------------------------------------- Kling

function klingToken() {
  if (!env.KLING_ACCESS_KEY || !env.KLING_SECRET_KEY) throw new ProviderError("KLING_ACCESS_KEY/KLING_SECRET_KEY no configuradas", false);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: env.KLING_ACCESS_KEY, exp: now + 1800, nbf: now - 5 });
  const sig = createHmac("sha256", env.KLING_SECRET_KEY).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

interface KlingResp<T> {
  code: number;
  message: string;
  data: T;
}

const kling: VideoProvider = {
  name: "kling",
  async imageToVideo(i) {
    const auth = () => ({ Authorization: `Bearer ${klingToken()}` });
    // Kling acepta URL o base64 SIN el prefijo data:
    const image = i.imageRef.startsWith("data:") ? i.imageRef.split(",")[1] : i.imageRef;
    const created = await jsonFetch<KlingResp<{ task_id: string }>>(`${env.KLING_BASE_URL}/v1/videos/image2video`, {
      method: "POST",
      headers: auth(),
      json: {
        model_name: env.KLING_MODEL,
        mode: "pro",
        image,
        prompt: i.prompt,
        negative_prompt: NEGATIVE_STYLE,
        cfg_scale: 0.6,
        duration: String(i.duration),
      },
    });
    if (created.code !== 0) throw new ProviderError(`Kling: ${created.message}`, created.code >= 1300);
    await i.onTaskId?.(created.data.task_id);
    const url = await pollUntil(
      async () => {
        const t = await jsonFetch<KlingResp<{ task_status: string; task_status_msg?: string; task_result?: { videos: { url: string }[] } }>>(
          `${env.KLING_BASE_URL}/v1/videos/image2video/${created.data.task_id}`,
          { headers: auth() },
        );
        if (t.data.task_status === "succeed") return t.data.task_result!.videos[0].url;
        if (t.data.task_status === "failed") throw new ProviderError(`Kling: ${t.data.task_status_msg}`, true);
        return null;
      },
      { label: "Kling", timeoutMs: 25 * 60_000, initialMs: 8000 },
    );
    return download(url, i.out);
  },
};

// --------------------------------------------------------------------------- mock

const mock: VideoProvider = {
  name: "mock",
  async imageToVideo(i) {
    const { width, height } = ASPECT_RESOLUTIONS[i.aspectRatio];
    return placeholderVideoFromImage(i.imagePath, i.out, i.duration, width, height);
  },
};

export const videoProvider: VideoProvider = { runway, kling, mock }[env.VIDEO_PROVIDER];
