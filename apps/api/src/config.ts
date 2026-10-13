import "dotenv/config";
import { z } from "zod/v4";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Almacenamiento: "local" (disco, para dev) o "s3" (R2 / S3 / MinIO)
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().optional(), // R2: https://<account>.r2.cloudflarestorage.com
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("frutinovelas"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(), // dominio público del bucket (opcional)

  // Proveedores: "mock" permite correr todo el pipeline sin claves (ffmpeg genera placeholders)
  LLM_PROVIDER: z.enum(["claude", "mock"]).default("claude"),
  IMAGE_PROVIDER: z.enum(["fal", "mock"]).default("mock"),
  VIDEO_PROVIDER: z.enum(["runway", "kling", "mock"]).default("mock"),
  TTS_PROVIDER: z.enum(["elevenlabs", "mock"]).default("mock"),
  LIPSYNC_PROVIDER: z.enum(["synclabs", "none"]).default("none"),
  MUSIC_PROVIDER: z.enum(["library", "elevenlabs", "mock"]).default("mock"),

  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),

  FAL_KEY: z.string().optional(),
  FAL_TEXT2IMG_MODEL: z.string().default("fal-ai/flux-pro/v1.1-ultra"),
  FAL_EDIT_MODEL: z.string().default("fal-ai/flux-pro/kontext/max/multi"),

  RUNWAY_API_KEY: z.string().optional(),
  RUNWAY_MODEL: z.string().default("gen4_turbo"),
  KLING_ACCESS_KEY: z.string().optional(),
  KLING_SECRET_KEY: z.string().optional(),
  KLING_BASE_URL: z.string().default("https://api-singapore.klingai.com"),
  KLING_MODEL: z.string().default("kling-v2-1"),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default("eleven_multilingual_v2"),
  /** JSON opcional con el catálogo de voces [{id,name,gender,age,accent,timbre}] */
  ELEVENLABS_VOICE_CATALOG: z.string().optional(),

  SYNCLABS_API_KEY: z.string().optional(),
  SYNCLABS_MODEL: z.string().default("lipsync-2"),

  // Concurrencia/rate limit del pipeline
  SHOT_CONCURRENCY: z.coerce.number().default(2),
  CHAPTER_CONCURRENCY: z.coerce.number().default(2), // capítulos (de novelas distintas) por réplica de worker
  BURN_SUBTITLES: bool,
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  WORK_DIR: z.string().default("tmp"),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
