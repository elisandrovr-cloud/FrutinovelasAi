import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config";
import { routes } from "./routes";

/** Construye la app Fastify sin escuchar en ningún puerto (servidor local y función de Vercel). */
export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true,
    bodyLimit: 5 * 1024 * 1024,
  });
  await app.register(cors, { origin: env.WEB_ORIGIN.split(","), credentials: true });
  // Todas las rutas cuelgan de /api: en Vercel la rewrite "/api/(.*)" llega con la ruta completa,
  // y en local/Docker se mantiene el mismo contrato para que el cliente no cambie.
  await app.register(routes, { prefix: "/api" });
  return app;
}
