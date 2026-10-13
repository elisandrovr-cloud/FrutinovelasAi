"use client";

import { useRef, useState } from "react";
import { Download, FileArchive, Film, Loader2, Share2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import type { ExportDTO, NovelaDTO } from "@fruti/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn, formatDuration } from "@/lib/utils";

interface Props {
  novela: NovelaDTO;
  refresh: () => Promise<unknown>;
}

const EXPORTS: { kind: ExportDTO["kind"]; label: string; desc: string; icon: typeof Download }[] = [
  { kind: "ZIP", label: "ZIP completo", desc: "Capítulos, subtítulos, guion y diseños", icon: FileArchive },
  { kind: "VERTICAL_SERIES", label: "Serie para TikTok / Reels / Shorts", desc: "Partes 9:16 numeradas + captions", icon: Smartphone },
  { kind: "LONG_VIDEO", label: "Un solo video largo", desc: "Para YouTube", icon: Film },
];

export function PlaylistTab({ novela, refresh }: Props) {
  const ready = novela.chapters.filter((c) => c.status === "DONE" && c.videoUrl);
  const [index, setIndex] = useState(0);
  const [vertical, setVertical] = useState(novela.aspectRatio === "9:16");
  const video = useRef<HTMLVideoElement>(null);
  const current = ready[index];

  async function exportAs(kind: ExportDTO["kind"]) {
    try {
      await api.exportNovela(novela.id, kind);
      toast.success("Exportando… aparecerá abajo cuando esté listo");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: novela.title, text: novela.tagline ?? "Mira mi frutinovela", url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    }
  }

  if (!ready.length) {
    return (
      <Card className="p-12 text-center">
        <p className="text-5xl">🎬</p>
        <p className="mt-4 text-muted-foreground">Aún no hay capítulos terminados.</p>
      </Card>
    );
  }

  const src = vertical ? current.verticalUrl ?? current.videoUrl : current.videoUrl;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid content-start gap-4">
        <div className={cn("mx-auto w-full overflow-hidden rounded-xl bg-black shadow-2xl", vertical ? "max-w-sm" : "")}>
          <video
            ref={video}
            key={src}
            src={src ?? undefined}
            poster={current.thumbnailUrl ?? undefined}
            controls
            autoPlay
            playsInline
            className={cn("w-full", vertical ? "aspect-[9/16]" : "aspect-video")}
            // Reproducción continua: al terminar un capítulo empieza el siguiente
            onEnded={() => index < ready.length - 1 && setIndex(index + 1)}
          >
            {current.subtitlesVttUrl && !vertical && <track kind="subtitles" srcLang="es" label="Español" src={current.subtitlesVttUrl} default={novela.subtitles} />}
          </video>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Capítulo {current.number}</p>
            <p className="font-display text-2xl font-bold">{current.title}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setVertical(!vertical)}>
              <Smartphone /> {vertical ? "Ver master" : "Ver vertical"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={(vertical ? current.verticalUrl : current.videoUrl) ?? "#"} download>
                <Download /> Descargar
              </a>
            </Button>
            {current.subtitlesUrl && (
              <Button variant="ghost" size="sm" asChild>
                <a href={current.subtitlesUrl} download>
                  .srt
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={share}>
              <Share2 /> Compartir
            </Button>
          </div>
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Playlist</CardTitle>
            <CardDescription>
              {ready.length}/{novela.chapterCount} capítulos · {formatDuration(ready.reduce((a, c) => a + (c.durationSec ?? 0), 0))}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 p-2">
            {ready.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setIndex(i)}
                className={cn("flex items-center gap-3 rounded-md p-2 text-left transition hover:bg-muted", i === index && "bg-primary/10 ring-1 ring-primary/40")}
              >
                <div className="h-12 w-20 shrink-0 overflow-hidden rounded bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.thumbnailUrl && <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {c.number}. {c.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDuration(c.durationSec)}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Exportar</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {EXPORTS.map((e) => (
              <Button key={e.kind} variant="outline" className="h-auto justify-start py-3" onClick={() => exportAs(e.kind)}>
                <e.icon />
                <span className="grid text-left">
                  <span>{e.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{e.kind === "LONG_VIDEO" ? `~${novela.totalMinutes} minutos para YouTube` : e.desc}</span>
                </span>
              </Button>
            ))}
            {novela.exports.length > 0 && (
              <div className="mt-2 grid gap-1 border-t pt-3">
                {novela.exports.map((x) => (
                  <div key={x.id} className="flex items-center justify-between text-sm">
                    <span>{EXPORTS.find((e) => e.kind === x.kind)?.label}</span>
                    {x.status === "DONE" && x.url ? (
                      <a href={x.url} download className="font-semibold text-primary hover:underline">
                        Descargar
                      </a>
                    ) : x.status === "FAILED" ? (
                      <span className="text-destructive">Error</span>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
