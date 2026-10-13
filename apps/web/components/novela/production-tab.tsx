"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clapperboard, Loader2, Pause, Play, PlayCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import type { ChapterDTO, NovelaDTO } from "@fruti/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { cn, formatDuration } from "@/lib/utils";
import { ChapterBadge } from "./status-badge";

interface Props {
  novela: NovelaDTO;
  refresh: () => Promise<unknown>;
  onWatch: () => void;
}

export function ProductionTab({ novela, refresh, onWatch }: Props) {
  const [busy, setBusy] = useState(false);
  const chapters = novela.chapters;
  const done = chapters.filter((c) => c.status === "DONE" && !c.scriptStale).length;
  const current = chapters.find((c) => c.status === "RENDERING" || c.status === "QUEUED");
  const overall = ((done + (current ? current.progress / 100 : 0)) / novela.chapterCount) * 100;
  const allApproved = novela.characters.length > 0 && novela.characters.every((c) => c.approved);
  const next = chapters.find((c) => c.status !== "DONE" || c.scriptStale);
  const producing = novela.status === "PRODUCING";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border-primary/30">
        <div className="bg-gradient-to-r from-primary/15 via-accent/10 to-gold/15 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">Producción en secuencia</p>
              <p className="font-display text-3xl font-black">
                {done}/{novela.chapterCount} capítulos
              </p>
              <p className="text-sm text-muted-foreground">
                {current ? `Capítulo ${current.number}: ${current.currentStep ?? "en cola"}` : novela.status === "PAUSED" ? "En pausa" : next ? `Siguiente: capítulo ${next.number}` : "¡Todo listo!"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {producing ? (
                <Button variant="outline" onClick={() => run(() => api.pause(novela.id), "Se pausará al terminar el plano en curso")} disabled={busy}>
                  <Pause /> Pausar
                </Button>
              ) : (
                <>
                  <Button variant="telenovela" size="lg" disabled={!allApproved || !next || busy} onClick={() => run(() => api.produce(novela.id, "ALL"), "¡Acción! Produciendo todos los capítulos en orden")}>
                    {busy ? <Loader2 className="animate-spin" /> : <Clapperboard />} Generar todos los videos en secuencia
                  </Button>
                  <Button variant="outline" size="lg" disabled={!allApproved || !next || busy} onClick={() => run(() => api.produce(novela.id, "SINGLE"), `Produciendo el capítulo ${next?.number}`)}>
                    <SkipForward /> Solo el siguiente
                  </Button>
                </>
              )}
              {done > 0 && (
                <Button variant="secondary" size="lg" onClick={onWatch}>
                  <PlayCircle /> Ver
                </Button>
              )}
            </div>
          </div>
          <Progress value={overall} className="mt-5 h-4" />
          {!allApproved && (
            <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Aprueba todos los personajes en la pestaña anterior.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-3">
        {chapters.map((c) => (
          <ChapterRow key={c.id} novela={novela} chapter={c} isNext={c.number === next?.number && !producing} refresh={refresh} />
        ))}
      </div>
    </div>
  );
}

function ChapterRow({ novela, chapter: c, isNext, refresh }: { novela: NovelaDTO; chapter: ChapterDTO; isNext: boolean; refresh: () => Promise<unknown> }) {
  const active = c.status === "RENDERING";
  const [detail, setDetail] = useState<ChapterDTO | null>(null);

  // Mientras se renderiza, mostramos las imágenes clave a medida que aparecen
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = () =>
      api
        .getChapter(novela.id, c.number)
        .then((d) => alive && setDetail(d))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active, novela.id, c.number]);

  const prevDone = c.number === 1 || novela.chapters.find((x) => x.number === c.number - 1)?.status === "DONE";

  return (
    <Card className={cn("transition", active && "border-primary shadow-lg shadow-primary/10")}>
      <CardHeader className="flex-row items-center gap-4 space-y-0 p-4">
        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
          {c.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center font-display text-2xl font-black text-muted-foreground">{c.number}</span>
          )}
        </div>
        <div className="grid flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">
              {c.number}. {c.title}
            </CardTitle>
            <ChapterBadge status={c.status} stale={c.scriptStale} />
            {c.durationSec && <span className="text-xs text-muted-foreground">{formatDuration(c.durationSec)}</span>}
          </div>
          {(active || c.status === "QUEUED") && (
            <div className="grid gap-1">
              <Progress value={c.progress} className="h-2" />
              <CardDescription>{c.currentStep}</CardDescription>
            </div>
          )}
          {c.error && <p className="text-xs text-destructive">{c.error}</p>}
        </div>
        {(c.status === "DONE" || c.status === "FAILED" || c.scriptStale) && !active && prevDone && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await api.produce(novela.id, "SINGLE", c.number);
                toast.success(`Re-produciendo capítulo ${c.number}`);
                await refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <Play /> {c.status === "DONE" && !c.scriptStale ? "Rehacer" : "Producir"}
          </Button>
        )}
        {isNext && c.status !== "DONE" && <span className="text-xs font-semibold text-primary">Siguiente</span>}
      </CardHeader>
      {active && detail?.shots && detail.shots.length > 0 && (
        <CardContent className="flex gap-2 overflow-x-auto px-4 pb-4">
          {detail.shots.map((s) => (
            <div key={s.id} className="relative h-24 w-16 shrink-0 overflow-hidden rounded bg-muted" title={`Escena ${s.sceneNumber} · plano ${s.shotNumber}${s.error ? ` — ${s.error}` : ""}`}>
              {s.keyframeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.keyframeUrl} alt="" className={cn("h-full w-full object-cover", s.status !== "READY" && "opacity-60")} />
              ) : (
                <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {s.status === "READY" && !s.error && <span className="absolute bottom-0.5 right-0.5 rounded bg-emerald-600 px-1 text-[9px] font-bold text-white">✓</span>}
              {s.error && <span className="absolute bottom-0.5 right-0.5 rounded bg-amber-500 px-1 text-[9px] font-bold text-white" title={s.error}>!</span>}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
