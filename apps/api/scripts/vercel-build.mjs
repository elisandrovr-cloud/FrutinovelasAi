// Build del servicio "api" en Vercel:
//  1. genera Prisma Client
//  2. aplica las migraciones si hay base de datos configurada (crea las tablas solo)
//  3. empaqueta la función serverless en dist/index.mjs
import { execSync } from "node:child_process";

const run = (cmd, extraEnv = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
const first = (...names) => names.map((n) => process.env[n]).find((v) => v && v.trim());

run("prisma generate");

// Las migraciones necesitan conexión directa (sin pgbouncer)
const migrateUrl = first(
  "DIRECT_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
);
if (migrateUrl) {
  try {
    run("prisma migrate deploy", { DATABASE_URL: migrateUrl, DIRECT_URL: migrateUrl });
  } catch {
    console.warn("⚠️  No se pudieron aplicar las migraciones; la API indicará el problema en /api/health.");
  }
} else {
  console.warn("⚠️  Sin base de datos configurada: se omiten las migraciones.");
}

run("tsup --config tsup.vercel.config.ts");
