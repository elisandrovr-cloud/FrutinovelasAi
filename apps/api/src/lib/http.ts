/** Utilidades HTTP para proveedores con tareas asíncronas (submit → poll). */

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export async function jsonFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  if (!res.ok) {
    // 429 y 5xx se reintentan (BullMQ aplica backoff exponencial)
    throw new ProviderError(`${res.status} ${url}: ${text.slice(0, 500)}`, res.status === 429 || res.status >= 500, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sondea hasta que `check` devuelva un valor (o lance). Backoff suave hasta 15 s. */
export async function pollUntil<T>(
  check: () => Promise<T | null>,
  { timeoutMs = 15 * 60_000, initialMs = 4000, label = "tarea" } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let wait = initialMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result !== null) return result;
    await sleep(wait);
    wait = Math.min(15_000, Math.round(wait * 1.4));
  }
  throw new ProviderError(`Timeout esperando ${label}`, true);
}
