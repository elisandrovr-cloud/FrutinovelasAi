import "dotenv/config";
import { z } from "zod/v4";

/**
 * Nombres alternativos que inyectan las integraciones del Marketplace de Vercel
 * (Neon / Supabase / Prisma Postgres y Upstash Redis): así basta con conectar la
 * integración, sin copiar variables a mano.
 */
const first = (...names: string[]) => names.map((n) => process.env[n]).find((v) => v && v.trim());
process.env.DATABASE_URL ||= first("POSTGRES_PRISMA_URL", "POSTGRES_URL", "SUPABASE_DB_URL");
process.env.REDIS_URL ||= first("KV_URL", "UPSTASH_REDIS_URL", "REDIS_TLS_URL");

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  /** Origen público donde se sirve /api (en Vercel, el dominio del proyecto). */
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  // Opcionales al parsear: si faltan, la API responde 503 con un mensaje claro
  // en vez de caerse al importar (en Vercel eso se ve como 500 en todo /api).
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

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

const parsed = EnvSchema.parse(process.env);
const onVercel = Boolean(process.env.VERCEL);

export const env = { ...parsed, REDIS_URL: parsed.REDIS_URL ?? "redis://localhost:6379" };
export type Env = typeof env;

/** Variables imprescindibles que faltan (la API devuelve 503 mientras haya alguna). */
export const missingEnv: string[] = [
  !parsed.DATABASE_URL && "DATABASE_URL",
  // En local se asume Redis en localhost; en Vercel no existe, hay que configurarlo.
  onVercel && !parsed.REDIS_URL && "REDIS_URL",
  parsed.STORAGE_DRIVER === "s3" && !parsed.S3_ACCESS_KEY_ID && "S3_ACCESS_KEY_ID",
  parsed.STORAGE_DRIVER === "s3" && !parsed.S3_SECRET_ACCESS_KEY && "S3_SECRET_ACCESS_KEY",
].filter((x): x is string => Boolean(x));

/** Configuración que funciona pero no es la adecuada para producción. */
export const envWarnings: string[] = [
  onVercel && parsed.STORAGE_DRIVER === "local" && "STORAGE_DRIVER=local no persiste en Vercel: usa s3 (R2/S3)",
  onVercel && parsed.LLM_PROVIDER === "claude" && !parsed.ANTHROPIC_API_KEY && "Falta ANTHROPIC_API_KEY (el worker no podrá escribir guiones)",
].filter((x): x is string => Boolean(x));
