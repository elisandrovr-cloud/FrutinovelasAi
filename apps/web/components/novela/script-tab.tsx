"use client";

import { useState } from "react";
import { ArrowRight, Loader2, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { NovelaDTO } from "@fruti/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScriptEditor } from "./script-editor";
import { ChapterBadge } from "./status-badge";

interface Props {
  novela: NovelaDTO;
  refresh: () => Promise<unknown>;
  onNext: () => void;
}

export function ScriptTab({ novela, refresh, onNext }: Props) {
  const [selected, setSelected] = useState(1);
  const [busy, setBusy] = useState(false);
  const bible = novela.bible;
  const scripted = novela.chapters.filter((c) => c.script).length;

  if (!bible) {
    return (
      <Card className="p-12 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 font-display text-2xl font-bold">La Pluma de Oro está escribiendo…</p>
        <p className="text-muted-foreground">Creando personajes, escenarios y la escaleta de {novela.chapterCount} capítulos.</p>
      </Card>
    );
  }

  const chapter = novela.chapters.find((c) => c.number === selected);

  async function regenerateAll() {
    if (!confirm("Se reescribirá TODA la historia (biblia, personajes y capítulos). ¿Seguro?")) return;
    setBusy(true);
    try {
      await api.regenerateScript(novela.id);
      toast.success("Reescribiendo la historia desde cero");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="grid gap-1.5">
            <CardTitle>Biblia de la historia</CardTitle>
            <CardDescription className="max-w-3xl text-base">{bible.logline}</CardDescription>
            <p className="text-sm text-muted-foreground">
              <b>Mundo:</b> {bible.setting} · <b>Tono:</b> {bible.tone}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={regenerateAll} disabled={busy || novela.status === "PRODUCING"}>
            <RefreshCw /> Reescribir todo
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {bible.sets.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <MapPin className="h-3 w-3" /> {s.name}
              </span>
            ))}
          </div>
          {scripted < novela.chapterCount && (
            <div className="grid gap-1">
              <Progress value={(scripted / novela.chapterCount) * 100} />
              <span className="text-xs text-muted-foreground">
                Guion detallado: {scripted}/{novela.chapterCount} capítulos (se escriben en orden para mantener la continuidad)
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav className="grid content-start gap-2">
          {novela.chapters.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.number)}
              className={cn(
                "grid gap-1 rounded-lg border bg-card p-3 text-left transition hover:border-primary/60",
                selected === c.number && "border-primary ring-2 ring-primary/20",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Capítulo {c.number}</span>
                {c.script ? <ChapterBadge status={c.status} stale={c.scriptStale} /> : <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <span className="font-display font-bold leading-tight">{c.title}</span>
              {c.outline.cliffhanger && <span className="line-clamp-2 text-xs italic text-muted-foreground">🪝 {c.outline.cliffhanger}</span>}
            </button>
          ))}
        </nav>

        {chapter && <ScriptEditor key={chapter.id + (chapter.script ? "s" : "")} novela={novela} chapter={chapter} refresh={refresh} />}
      </div>

      <div className="flex justify-end">
        <Button variant="telenovela" size="lg" disabled={scripted < novela.chapterCount} onClick={onNext}>
          Continuar a personajes <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
