/**
 * Imágenes: personajes, escenarios e imágenes clave de cada plano.
 *  - fal.ai: FLUX 1.1 Pro Ultra (texto→imagen con seed) para referencias,
 *            FLUX Kontext Max Multi (edición con varias imágenes de referencia) para
 *            hojas de giro/expresiones y para componer cada plano con los personajes.
 *  - mock:  placeholder generado con ffmpeg.
 * Todos devuelven la ruta de un PNG local ya descargado.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config";
import { placeholderImage } from "../../lib/ffmpeg";
import { jsonFetch, pollUntil, ProviderError } from "../../lib/http";

export interface TextToImageInput {
  prompt: string;
  seed: number;
  aspectRatio: "16:9" | "9:16" | "1:1" | "3:4";
  out: string;
  label?: string;
}

export interface EditImageInput extends TextToImageInput {
  /** URLs o data URIs: la primera suele ser la referencia principal. */
  images: string[];
}

export interface ImageProvider {
  textToImage(i: TextToImageInput): Promise<string>;
  editWithReferences(i: EditImageInput): Promise<string>;
}

// --------------------------------------------------------------------------- fal

interface FalQueued {
  request_id: string;
  status_url: string;
  response_url: string;
}
interface FalResult {
  images: { url: string }[];
}

async function falRun(model: string, input: Record<string, unknown>): Promise<FalResult> {
  if (!env.FAL_KEY) throw new ProviderError("FAL_KEY no configurada", false);
  const headers = { Authorization: `Key ${env.FAL_KEY}` };
  const queued = await jsonFetch<FalQueued>(`https://queue.fal.run/${model}`, { method: "POST", headers, json: input });
  await pollUntil(
    async () => {
      const s = await jsonFetch<{ status: string; error?: string }>(queued.status_url, { headers });
      if (s.status === "COMPLETED") return true;
      if (s.status === "FAILED" || s.status === "ERROR") throw new ProviderError(`fal: ${s.error ?? "falló"}`, true);
      return null;
    },
    { label: `fal ${model}`, initialMs: 2000, timeoutMs: 5 * 60_000 },
  );
  return jsonFetch<FalResult>(queued.response_url, { headers });
}

async function download(url: string, out: string) {
  const res = await fetch(url);
  if (!res.ok) throw new ProviderError(`Descarga de imagen fallida ${res.status}`, true);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

const falProvider: ImageProvider = {
  async textToImage(i) {
    const r = await falRun(env.FAL_TEXT2IMG_MODEL, {
      prompt: i.prompt,
      seed: i.seed,
      aspect_ratio: i.aspectRatio,
      output_format: "png",
      num_images: 1,
      safety_tolerance: "2",
    });
    return download(r.images[0].url, i.out);
  },
  async editWithReferences(i) {
    const r = await falRun(env.FAL_EDIT_MODEL, {
      prompt: i.prompt,
      image_urls: i.images,
      seed: i.seed,
      aspect_ratio: i.aspectRatio,
      guidance_scale: 3.5,
      output_format: "png",
      num_images: 1,
      safety_tolerance: "2",
    });
    return download(r.images[0].url, i.out);
  },
};

// --------------------------------------------------------------------------- mock

const DIMS = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024], "3:4": [768, 1024] } as const;
const COLORS = ["#c2185b", "#ef6c00", "#2e7d32", "#6a1b9a", "#00838f", "#f9a825", "#ad1457"];

const mockProvider: ImageProvider = {
  async textToImage(i) {
    const [w, h] = DIMS[i.aspectRatio];
    return placeholderImage(i.out, w, h, COLORS[i.seed % COLORS.length], i.label ?? path.basename(i.out));
  },
  async editWithReferences(i) {
    const [w, h] = DIMS[i.aspectRatio];
    return placeholderImage(i.out, w, h, COLORS[(i.seed + i.images.length) % COLORS.length], i.label ?? path.basename(i.out));
  },
};

export const imageProvider: ImageProvider = env.IMAGE_PROVIDER === "fal" ? falProvider : mockProvider;
