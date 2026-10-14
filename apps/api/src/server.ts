// Servidor de larga duración (desarrollo local y Docker). En Vercel se usa src/vercel.ts.
import { env } from "./config";
import { buildApp } from "./app";

const app = await buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
