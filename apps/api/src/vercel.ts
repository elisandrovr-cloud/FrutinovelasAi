/**
 * Función serverless de Vercel: handler (req, res) sin listen ni top-level await.
 * La app se construye una vez por instancia y se reutiliza entre invocaciones.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "./app";

let ready: ReturnType<typeof init> | null = null;

async function init() {
  const app = await buildApp();
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    ready ??= init();
    const app = await ready;
    app.server.emit("request", req, res);
  } catch (err) {
    ready = null; // reintentar la inicialización en la siguiente petición
    console.error("[api] fallo al iniciar", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: `La API no pudo iniciar: ${(err as Error).message}` }));
  }
}
