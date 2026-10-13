"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NovelaDTO } from "@fruti/shared";
import { api } from "@/lib/api";

const BUSY = new Set(["SCRIPTING", "DESIGNING", "PRODUCING"]);

/**
 * Carga la novela y hace polling mientras haya trabajo en curso (guion, diseño,
 * producción o exportaciones). Polling es más robusto que websockets detrás de
 * proxies/serverless y para este caso (actualizaciones cada pocos segundos) basta.
 */
export function useNovela(id: string) {
  const [novela, setNovela] = useState<NovelaDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(async () => {
    try {
      const n = await api.getNovela(id);
      setNovela(n);
      setError(null);
      return n;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    const loop = async () => {
      const n = await refresh();
      if (!alive) return;
      const busy =
        !n ||
        BUSY.has(n.status) ||
        n.characters.some((c) => c.versions[0]?.status === "GENERATING" || c.versions[0]?.status === "PENDING") ||
        n.chapters.some((c) => c.status === "QUEUED" || c.status === "RENDERING") ||
        n.exports.some((e) => e.status === "QUEUED" || e.status === "RUNNING");
      timer.current = setTimeout(loop, busy ? 2500 : 15000);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [refresh]);

  return { novela, error, refresh, setNovela };
}
