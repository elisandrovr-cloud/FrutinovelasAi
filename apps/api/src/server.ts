import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config";
import { routes } from "./routes";

const app = Fastify({
  logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true,
  bodyLimit: 5 * 1024 * 1024,
});

await app.register(cors, { origin: env.WEB_ORIGIN.split(","), credentials: true });
await app.register(routes);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
