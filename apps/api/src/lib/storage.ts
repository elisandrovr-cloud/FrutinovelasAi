/**
 * Almacenamiento de assets: R2/S3 en producción, disco local en desarrollo.
 * En BD solo se guardan claves (p.ej. "novelas/<id>/chapters/03/final.mp4");
 * las URLs se generan al vuelo (firmadas o públicas).
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config";

const s3 =
  env.STORAGE_DRIVER === "s3"
    ? new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
          secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
        },
        forcePathStyle: Boolean(env.S3_ENDPOINT), // R2 y MinIO
      })
    : null;

const localRoot = path.resolve(env.LOCAL_STORAGE_DIR);

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".srt": "application/x-subrip",
  ".vtt": "text/vtt",
  ".json": "application/json",
  ".zip": "application/zip",
};

export function contentTypeFor(key: string) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

export const keys = {
  characterRef: (novelaId: string, charKey: string, v: number) => `novelas/${novelaId}/characters/${charKey}/v${v}/reference.png`,
  characterTurnaround: (novelaId: string, charKey: string, v: number) => `novelas/${novelaId}/characters/${charKey}/v${v}/turnaround.png`,
  characterExpressions: (novelaId: string, charKey: string, v: number) => `novelas/${novelaId}/characters/${charKey}/v${v}/expressions.png`,
  voicePreview: (novelaId: string, charKey: string, v: number) => `novelas/${novelaId}/characters/${charKey}/v${v}/voice.mp3`,
  setRef: (novelaId: string, setKey: string) => `novelas/${novelaId}/sets/${setKey}.png`,
  shot: (novelaId: string, ch: number, order: number, file: string) =>
    `novelas/${novelaId}/chapters/${String(ch).padStart(2, "0")}/shots/${String(order).padStart(3, "0")}/${file}`,
  chapter: (novelaId: string, ch: number, file: string) => `novelas/${novelaId}/chapters/${String(ch).padStart(2, "0")}/${file}`,
  export: (novelaId: string, file: string) => `novelas/${novelaId}/exports/${file}`,
  cover: (novelaId: string) => `novelas/${novelaId}/cover.png`,
};

export async function putFile(key: string, filePath: string) {
  if (s3) {
    const { size } = await stat(filePath);
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentTypeFor(key),
      }),
    );
    return key;
  }
  const dest = path.join(localRoot, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(createReadStream(filePath), createWriteStream(dest));
  return key;
}

export async function putBuffer(key: string, body: Buffer) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentTypeFor(key) }));
    return key;
  }
  const dest = path.join(localRoot, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, body);
  return key;
}

/** Descarga una URL remota (resultado de un proveedor) directamente al storage. */
export async function putFromUrl(key: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga fallida ${res.status} ${url}`);
  return putBuffer(key, Buffer.from(await res.arrayBuffer()));
}

/** Copia un objeto del storage a un archivo local (para ffmpeg). */
export async function downloadTo(key: string, filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (s3) {
    const out = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    await pipeline(out.Body as Readable, createWriteStream(filePath));
    return filePath;
  }
  await pipeline(createReadStream(path.join(localRoot, key)), createWriteStream(filePath));
  return filePath;
}

export async function readObject(key: string): Promise<Buffer> {
  if (s3) {
    const out = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
  return readFile(path.join(localRoot, key));
}

export function localPathFor(key: string) {
  return path.join(localRoot, key);
}

/** URL para el navegador (y para proveedores externos en modo s3). */
export async function urlFor(key: string | null | undefined, expiresIn = 60 * 60 * 6): Promise<string | null> {
  if (!key) return null;
  if (s3) {
    if (env.S3_PUBLIC_BASE_URL) return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn });
  }
  return `${env.PUBLIC_API_URL}/files/${key}`;
}

/**
 * Los proveedores de IA necesitan descargar nuestras imágenes. En local no son
 * accesibles desde internet, así que se envían como data URI (Runway, fal y
 * Kling lo aceptan para imágenes pequeñas).
 */
export async function providerImageRef(key: string): Promise<string> {
  if (s3) return (await urlFor(key, 60 * 60))!;
  const buf = await readObject(key);
  return `data:${contentTypeFor(key)};base64,${buf.toString("base64")}`;
}
