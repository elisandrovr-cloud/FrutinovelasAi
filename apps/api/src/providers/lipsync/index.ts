/**
 * Lip-sync con Sync Labs (sync.so, modelo lipsync-2). Necesita URLs públicas
 * del video y del audio → solo con STORAGE_DRIVER=s3. Alternativa self-hosted:
 * Wav2Lip / LatentSync en una GPU propia exponiendo la misma interfaz.
 */
import { writeFile } from "node:fs/promises";
import { env } from "../../config";
import { jsonFetch, pollUntil, ProviderError } from "../../lib/http";

export interface LipsyncProvider {
  enabled: boolean;
  sync(i: { videoUrl: string; audioUrl: string; out: string }): Promise<string>;
}

const SYNC = "https://api.sync.so/v2";

const synclabs: LipsyncProvider = {
  enabled: true,
  async sync(i) {
    if (!env.SYNCLABS_API_KEY) throw new ProviderError("SYNCLABS_API_KEY no configurada", false);
    const headers = { "x-api-key": env.SYNCLABS_API_KEY };
    const job = await jsonFetch<{ id: string }>(`${SYNC}/generate`, {
      method: "POST",
      headers,
      json: {
        model: env.SYNCLABS_MODEL,
        input: [
          { type: "video", url: i.videoUrl },
          { type: "audio", url: i.audioUrl },
        ],
        // el audio manda: si es más largo que el clip, el clip se recorta/extiende
        options: { sync_mode: "bounce", active_speaker_detection: { auto_detect: true } },
      },
    });
    const url = await pollUntil(
      async () => {
        const r = await jsonFetch<{ status: string; outputUrl?: string; error?: string }>(`${SYNC}/generate/${job.id}`, { headers });
        if (r.status === "COMPLETED" && r.outputUrl) return r.outputUrl;
        if (r.status === "FAILED" || r.status === "REJECTED") throw new ProviderError(`Sync Labs: ${r.error ?? r.status}`, r.status === "FAILED");
        return null;
      },
      { label: "Sync Labs", timeoutMs: 15 * 60_000 },
    );
    const res = await fetch(url);
    await writeFile(i.out, Buffer.from(await res.arrayBuffer()));
    return i.out;
  },
};

const none: LipsyncProvider = {
  enabled: false,
  async sync() {
    throw new Error("lip-sync deshabilitado");
  },
};

export const lipsyncProvider: LipsyncProvider = env.LIPSYNC_PROVIDER === "synclabs" && env.STORAGE_DRIVER === "s3" ? synclabs : none;
