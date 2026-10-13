/**
 * Guion y diálogos con Claude (SDK oficial @anthropic-ai/sdk).
 *  - Salidas estructuradas validadas con Zod (betaZodOutputFormat) → nada de JSON roto.
 *  - Streaming + finalMessage(): permite max_tokens altos sin timeouts HTTP.
 *  - System prompt estable con cache_control: los 8-12 capítulos reutilizan la caché.
 *  - fallbacks "default": si el clasificador de seguridad rechaza (p.ej. un falso
 *    positivo con una "cachetada"), la API reintenta con el modelo de respaldo recomendado.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";
import { env } from "../../config";
import { ProviderError } from "../../lib/http";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 4 });

// Modelos que aceptan el parámetro server-side `fallbacks: "default"`.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export async function claudeStructured<S extends z.ZodType>(p: {
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const useFallbacks = FALLBACK_MODELS.has(env.CLAUDE_MODEL);
  const stream = client.beta.messages.stream({
    model: env.CLAUDE_MODEL,
    max_tokens: p.maxTokens ?? 64000,
    ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: p.prompt }],
    output_config: { effort: p.effort ?? "high", format: betaZodOutputFormat(p.schema) },
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
      throw new ProviderError(`Claude: ${err.message}`, true);
    }
    if (err instanceof Anthropic.APIError) throw new ProviderError(`Claude ${err.status}: ${err.message}`, false, err.status);
    throw err;
  }

  if (message.stop_reason === "refusal") {
    throw new ProviderError(`Claude rechazó la petición (${message.stop_details?.category ?? "sin categoría"}). Reformula la idea.`, false);
  }
  if (message.stop_reason === "max_tokens") {
    throw new ProviderError("Claude se quedó sin tokens de salida; reduce el número de capítulos o la duración.", false);
  }
  if (!message.parsed_output) throw new ProviderError("Claude devolvió una salida que no cumple el esquema", true);
  return message.parsed_output as z.infer<S>;
}
