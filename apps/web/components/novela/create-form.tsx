"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { ACCENTS, GENRES, type Genre } from "@fruti/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const GENRE_LABELS: Record<Genre, string> = {
  drama: "💔 Drama",
  romance: "💘 Romance",
  traicion: "🗡️ Traición",
  comedia: "😂 Comedia",
  suspenso: "🕯️ Suspenso",
  venganza: "🔥 Venganza",
  misterio: "🔍 Misterio",
  familia: "👪 Familia",
  accion: "💥 Acción",
};

const IDEAS = [
  "Una piña celosa se enamora de un mango que está con una fresa",
  "Una sandía millonaria descubre que su hija perdida es una humilde uva del mercado",
  "Dos gemelas cerezas intercambian vidas el día de la boda de una de ellas",
  "Un aguacate doctor esconde que el plátano mayordomo es su verdadero padre",
];

export function CreateNovelaForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [genres, setGenres] = useState<Genre[]>(["drama", "romance"]);
  const [chapterCount, setChapterCount] = useState(10);
  const [totalMinutes, setTotalMinutes] = useState(20);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [accent, setAccent] = useState<(typeof ACCENTS)[number]>("mexicano");
  const [subtitles, setSubtitles] = useState(true);
  const [loading, setLoading] = useState(false);

  const toggleGenre = (g: Genre) =>
    setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : cur.length >= 4 ? cur : [...cur, g]));

  const perChapter = Math.round((totalMinutes * 60) / chapterCount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 10) return toast.error("Cuéntanos un poquito más de la historia (mín. 10 caracteres)");
    if (!genres.length) return toast.error("Elige al menos un género");
    setLoading(true);
    try {
      const { id } = await api.createNovela({ prompt, genres, chapterCount, totalMinutes, aspectRatio, accent, subtitles });
      toast.success("¡Luces, cámara… fruta! Escribiendo el guion");
      router.push(`/novelas/${id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/20 shadow-xl shadow-primary/10">
      <CardHeader>
        <CardTitle>Nueva frutinovela</CardTitle>
        <CardDescription>Todo es editable después: guion, personajes y voces.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="prompt">La idea</Label>
            <Textarea
              id="prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Una piña celosa se enamora de un mango que está con una fresa…"
              maxLength={2000}
            />
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button
                  type="button"
                  key={idea}
                  onClick={() => setPrompt(idea)}
                  className="rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
                >
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {idea.slice(0, 42)}…
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Géneros (hasta 4)</Label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => toggleGenre(g)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                    genres.includes(g) ? "border-primary bg-primary text-primary-foreground shadow" : "bg-background hover:border-primary/60",
                  )}
                >
                  {GENRE_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="chapters">
                Capítulos: <span className="text-primary">{chapterCount}</span>
              </Label>
              <input id="chapters" type="range" min={8} max={12} value={chapterCount} onChange={(e) => setChapterCount(Number(e.target.value))} className="accent-[hsl(var(--primary))]" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="minutes">
                Duración total: <span className="text-primary">{totalMinutes} min</span>
              </Label>
              <input id="minutes" type="range" min={12} max={30} value={totalMinutes} onChange={(e) => setTotalMinutes(Number(e.target.value))} className="accent-[hsl(var(--primary))]" />
            </div>
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            ≈ {Math.floor(perChapter / 60)}:{String(perChapter % 60).padStart(2, "0")} por capítulo (ideal 1:30–3:00 para redes)
          </p>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="format">Formato</Label>
              <NativeSelect id="format" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as "9:16" | "16:9")}>
                <option value="9:16">Vertical 9:16 (TikTok/Reels)</option>
                <option value="16:9">Horizontal 16:9 (YouTube)</option>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="accent">Acento</Label>
              <NativeSelect id="accent" value={accent} onChange={(e) => setAccent(e.target.value as typeof accent)}>
                {ACCENTS.map((a) => (
                  <option key={a} value={a}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subs">Subtítulos</Label>
              <div className="flex h-10 items-center gap-2">
                <Switch id="subs" checked={subtitles} onCheckedChange={setSubtitles} />
                <span className="text-sm text-muted-foreground">{subtitles ? "Sí (.srt)" : "No"}</span>
              </div>
            </div>
          </div>

          <Button type="submit" variant="telenovela" size="lg" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
            Generar guion completo
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
