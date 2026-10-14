import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config";
import { routes } from "./routes";

const app = Fastify({
  logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true,
  bodyLimit: 5 * 1024 * 1024,
});

await app.register(cors, { origin: env.WEB_ORIGIN.split(","), credentials: true });
// Todas las rutas cuelgan de /api: en Vercel la rewrite "/api/(.*)" llega con la ruta completa,
// y en local/Docker se mantiene el mismo contrato para que el cliente no cambie.
await app.register(routes, { prefix: "/api" });

await app.listen({ port: env.PORT, host: "0.0.0.0" });

export default app;
