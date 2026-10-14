"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { API_URL } from "@/lib/api";

interface Health {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/** Aviso global si el backend no está configurado (variables, Redis o worker). */
export function ServerStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/health`, { cache: "no-store" })
      .then(async (r) => setHealth((await r.json()) as Health))
      .catch(() => setDown(true));
  }, []);

  const problems = down
    ? ["No se puede contactar con la API (/api)."]
    : health
      ? [...(health.missing.length ? [`Faltan variables de entorno en el servidor: ${health.missing.join(", ")}`] : []), ...health.warnings]
      : [];
  if (!problems.length) return null;

  return (
    <div className={health?.ok === false || down ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}>
      <div className="container flex items-start gap-2 py-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <b>Configuración del servidor incompleta.</b> {problems.join(" · ")}{" "}
          <a className="underline" href="https://github.com/elisandrovr-cloud/FrutinovelasAi/blob/claude/amazing-euler-s0hcr7/docs/04-DESPLIEGUE.md" target="_blank" rel="noreferrer">
            Cómo arreglarlo
          </a>
        </div>
      </div>
    </div>
  );
}
