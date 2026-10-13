"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clapperboard, Loader2, PlayCircle, ScrollText, Users } from "lucide-react";
import type { NovelaDTO } from "@fruti/shared";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNovela } from "@/hooks/use-novela";
import { cn } from "@/lib/utils";
import { CharactersTab } from "./characters-tab";
import { PlaylistTab } from "./playlist-tab";
import { ProductionTab } from "./production-tab";
import { ScriptTab } from "./script-tab";
import { StatusBadge } from "./status-badge";

const STEPS = [
  { key: "guion", label: "Guion", icon: ScrollText },
  { key: "personajes", label: "Personajes", icon: Users },
  { key: "produccion", label: "Producción", icon: Clapperboard },
  { key: "playlist", label: "Playlist", icon: PlayCircle },
] as const;
type Step = (typeof STEPS)[number]["key"];

function suggestedTab(n: NovelaDTO): Step {
  if (n.status === "COMPLETED") return "playlist";
  if (n.status === "PRODUCING" || n.status === "PAUSED" || n.chapters.some((c) => c.status === "DONE")) return "produccion";
  if (n.status === "DESIGNING" || n.status === "DESIGN_READY") return "personajes";
  return "guion";
}

function stepDone(n: NovelaDTO, step: Step) {
  switch (step) {
    case "guion":
      return n.chapters.length > 0 && n.chapters.every((c) => c.script);
    case "personajes":
      return n.characters.length > 0 && n.characters.every((c) => c.approved);
    case "produccion":
      return n.chapters.length > 0 && n.chapters.every((c) => c.status === "DONE");
    case "playlist":
      return n.status === "COMPLETED";
  }
}

export function NovelaWorkspace({ id }: { id: string }) {
  const { novela, error, refresh } = useNovela(id);
  const [tab, setTab] = useState<Step | null>(null);

  useEffect(() => {
    if (novela && !tab) setTab(suggestedTab(novela));
  }, [novela, tab]);

  if (error && !novela) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-4">{error}</p>
      </Card>
    );
  }
  if (!novela) return <Loader2 className="mx-auto mt-24 h-10 w-10 animate-spin text-primary" />;

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={novela.status} />
          <span className="text-xs text-muted-foreground">
            {novela.chapterCount} capítulos · ~{novela.totalMinutes} min · {novela.aspectRatio}
          </span>
        </div>
        <h1 className="font-display text-4xl font-black italic md:text-5xl">
          {novela.status === "SCRIPTING" && !novela.bible ? <span className="animate-pulse">Escribiendo el melodrama…</span> : novela.title}
        </h1>
        {novela.tagline && <p className="text-lg text-muted-foreground">“{novela.tagline}”</p>}
        {novela.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {novela.error}
          </div>
        )}
      </header>

      <Tabs value={tab ?? "guion"} onValueChange={(v) => setTab(v as Step)}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          {STEPS.map((s, i) => (
            <TabsTrigger key={s.key} value={s.key} className="gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black",
                  stepDone(novela, s.key) ? "bg-emerald-600 text-white" : "bg-muted-foreground/20",
                )}
              >
                {stepDone(novela, s.key) ? "✓" : i + 1}
              </span>
              <s.icon /> {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="guion">
          <ScriptTab novela={novela} refresh={refresh} onNext={() => setTab("personajes")} />
        </TabsContent>
        <TabsContent value="personajes">
          <CharactersTab novela={novela} refresh={refresh} onNext={() => setTab("produccion")} />
        </TabsContent>
        <TabsContent value="produccion">
          <ProductionTab novela={novela} refresh={refresh} onWatch={() => setTab("playlist")} />
        </TabsContent>
        <TabsContent value="playlist">
          <PlaylistTab novela={novela} refresh={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
