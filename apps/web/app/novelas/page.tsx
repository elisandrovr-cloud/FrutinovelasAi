"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Film, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { NovelaSummaryDTO } from "@fruti/shared";
import { StatusBadge } from "@/components/novela/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";

export default function HistoryPage() {
  const [items, setItems] = useState<NovelaSummaryDTO[] | null>(null);

  useEffect(() => {
    api.listNovelas().then(setItems).catch((e) => toast.error(e.message));
  }, []);

  async function remove(id: string) {
    if (!confirm("¿Borrar esta frutinovela y todos sus videos?")) return;
    await api.deleteNovela(id);
    setItems((cur) => cur?.filter((n) => n.id !== id) ?? null);
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black">Mis frutinovelas</h1>
          <p className="text-muted-foreground">Tu historial de dramas frutales.</p>
        </div>
        <Button variant="telenovela" asChild>
          <Link href="/">
            <Plus /> Nueva
          </Link>
        </Button>
      </div>

      {!items ? (
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-5xl">🍓💔🥭</p>
          <p className="mt-4 text-muted-foreground">Todavía no has creado ninguna. ¡El drama te espera!</p>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((n) => (
            <Card key={n.id} className="group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
              <Link href={`/novelas/${n.id}`}>
                <div className="relative aspect-video bg-gradient-to-br from-primary/30 via-accent/20 to-gold/30">
                  {n.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Film className="absolute inset-0 m-auto h-10 w-10 text-primary/60" />
                  )}
                  <div className="absolute left-3 top-3">
                    <StatusBadge status={n.status} />
                  </div>
                </div>
              </Link>
              <CardContent className="grid gap-3 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/novelas/${n.id}`} className="font-display text-xl font-bold leading-tight hover:text-primary">
                    {n.title}
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => remove(n.id)} aria-label="Borrar">
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </div>
                {n.tagline && <p className="line-clamp-2 text-sm italic text-muted-foreground">{n.tagline}</p>}
                <div className="grid gap-1">
                  <Progress value={(n.chaptersDone / n.chapterCount) * 100} className="h-2" />
                  <span className="text-xs text-muted-foreground">
                    {n.chaptersDone}/{n.chapterCount} capítulos · {new Date(n.createdAt).toLocaleDateString("es")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
