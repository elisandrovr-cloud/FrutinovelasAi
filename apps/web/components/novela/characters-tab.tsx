"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, Palette, Pencil, RefreshCw, Sparkles, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { CharacterDTO, NovelaDTO, VoiceOptionDTO } from "@fruti/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface Props {
  novela: NovelaDTO;
  refresh: () => Promise<unknown>;
  onNext: () => void;
}

export function CharactersTab({ novela, refresh, onNext }: Props) {
  const [voices, setVoices] = useState<VoiceOptionDTO[]>([]);
  const [starting, setStarting] = useState(false);
  const designed = novela.characters.some((c) => c.versions[0]?.referenceImageUrl || c.versions[0]?.status === "GENERATING");
  const scriptReady = novela.chapters.length > 0 && novela.chapters.every((c) => c.script);
  const allApproved = novela.characters.length > 0 && novela.characters.every((c) => c.approved);

  useEffect(() => {
    api.voices().then(setVoices).catch(() => setVoices([]));
  }, []);

  async function startDesign() {
    setStarting(true);
    try {
      await api.design(novela.id);
      toast.success("Diseñando personajes y escenarios…");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="grid gap-6">
      {!designed && (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-5xl">🎨🍍🥭🍓</p>
          <p className="max-w-lg text-muted-foreground">
            Generaremos para cada personaje una <b>hoja de referencia</b>, una <b>hoja de giro</b> y una <b>hoja de expresiones</b> con semilla fija, y le
            asignaremos una voz. Son los assets que garantizan que se vea y suene igual en los {novela.chapterCount} capítulos.
          </p>
          <Button variant="telenovela" size="lg" onClick={startDesign} disabled={!scriptReady || starting}>
            {starting ? <Loader2 className="animate-spin" /> : <Sparkles />} Diseñar personajes
          </Button>
          {!scriptReady && <p className="text-xs text-muted-foreground">Espera a que termine el guion.</p>}
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {novela.characters.map((c) => (
          <CharacterCard key={c.id} character={c} voices={voices} novela={novela} refresh={refresh} />
        ))}
      </div>

      {designed && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!allApproved && <span className="text-sm text-muted-foreground">Aprueba a todos los personajes para empezar a producir.</span>}
          <Button variant="telenovela" size="lg" disabled={!allApproved} onClick={onNext}>
            Ir a producción <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function CharacterCard({ character: c, voices, novela, refresh }: { character: CharacterDTO; voices: VoiceOptionDTO[]; novela: NovelaDTO; refresh: () => Promise<unknown> }) {
  const v = c.versions[0];
  const [view, setView] = useState<"ref" | "expr">("ref");
  const [editing, setEditing] = useState(false);
  const busy = v?.status === "GENERATING" || v?.status === "PENDING";
  const producedChapters = novela.chapters.filter((ch) => ch.status === "DONE").length;

  // formulario de edición
  const [outfit, setOutfit] = useState(c.bible.visual.outfit);
  const [accessories, setAccessories] = useState(c.bible.visual.accessories.join(", "));
  const [promptEn, setPromptEn] = useState(c.bible.visual.promptEn);
  const [voiceId, setVoiceId] = useState(v?.voiceId ?? "");
  const [stability, setStability] = useState(v?.voiceSettings.stability ?? 0.4);
  const [style, setStyle] = useState(v?.voiceSettings.style ?? 0.45);
  const [fromChapter, setFromChapter] = useState(Math.min(novela.chapterCount, producedChapters + 1));

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  async function saveEdit() {
    const visualChanged = outfit !== c.bible.visual.outfit || accessories !== c.bible.visual.accessories.join(", ") || promptEn !== c.bible.visual.promptEn;
    await act(
      () =>
        api.updateCharacter(c.id, {
          visual: visualChanged ? { outfit, accessories: accessories.split(",").map((s) => s.trim()).filter(Boolean), promptEn } : undefined,
          voiceId: voiceId !== v?.voiceId ? voiceId : undefined,
          voiceSettings: stability !== v?.voiceSettings.stability || style !== v?.voiceSettings.style ? { stability, style } : undefined,
          effectiveFromChapter: fromChapter,
        }),
      fromChapter > 1 ? `Nueva versión: se usará desde el capítulo ${fromChapter}` : "Rediseñando personaje…",
    );
    setEditing(false);
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[3/4] bg-gradient-to-br from-muted to-secondary">
        {busy && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 backdrop-blur-sm">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
        {v?.status === "FAILED" && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-destructive">Error al diseñar. Pulsa regenerar.</div>}
        {(view === "ref" ? v?.referenceImageUrl : v?.expressionSheetUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(view === "ref" ? v.referenceImageUrl : v.expressionSheetUrl)!} alt={c.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {c.approved ? (
            <Badge variant="success">
              <Check className="h-3 w-3" /> Aprobado
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-background/80">
              Pendiente
            </Badge>
          )}
          {v && v.version > 1 && <Badge variant="secondary">v{v.version} · desde cap. {v.effectiveFromChapter}</Badge>}
        </div>
        {v?.expressionSheetUrl && (
          <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-md border bg-background/90 text-xs font-semibold">
            <button className={view === "ref" ? "bg-primary px-2 py-1 text-primary-foreground" : "px-2 py-1"} onClick={() => setView("ref")}>
              Referencia
            </button>
            <button className={view === "expr" ? "bg-primary px-2 py-1 text-primary-foreground" : "px-2 py-1"} onClick={() => setView("expr")}>
              Expresiones
            </button>
          </div>
        )}
      </div>

      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{c.name}</CardTitle>
        <CardDescription>
          {c.fruit} · {c.role} · {c.bible.age} años
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-muted-foreground">{c.bible.personality}</p>
        <p className="italic">“{c.bible.catchphrase}”</p>
        <div className="flex items-center gap-1">
          {c.bible.visual.palette.map((hex) => (
            <span key={hex} className="h-5 w-5 rounded-full border" style={{ backgroundColor: hex }} title={hex} />
          ))}
          <span className="ml-2 text-xs text-muted-foreground">{c.bible.visual.outfit}</span>
        </div>
        {v?.voicePreviewUrl && (
          <div className="grid gap-1 rounded-md bg-muted/50 p-2">
            <span className="flex items-center gap-1 text-xs font-semibold">
              <Volume2 className="h-3 w-3" /> {v.voiceName ?? "Voz"} · {c.bible.voice.accent} · {c.bible.voice.timbre}
            </span>
            <audio controls src={v.voicePreviewUrl} className="h-8 w-full" />
          </div>
        )}

        {v?.dnaPrompt && (
          <details className="rounded-md border px-3 py-2 text-xs">
            <summary className="flex cursor-pointer items-center gap-1 font-semibold">
              <Palette className="h-3 w-3" /> ADN de continuidad (semilla {v.seed})
            </summary>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{v.dnaPrompt}</p>
          </details>
        )}

        {editing ? (
          <div className="grid gap-3 rounded-md border p-3">
            <Label>Vestuario</Label>
            <Input value={outfit} onChange={(e) => setOutfit(e.target.value)} />
            <Label>Accesorios (separados por coma)</Label>
            <Input value={accessories} onChange={(e) => setAccessories(e.target.value)} />
            <Label>Prompt visual (inglés)</Label>
            <Textarea rows={3} value={promptEn} onChange={(e) => setPromptEn(e.target.value)} className="text-xs" />
            <Label>Voz</Label>
            <NativeSelect value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {voices.map((vo) => (
                <option key={vo.id} value={vo.id}>
                  {vo.name} {Object.values(vo.labels).slice(0, 3).join(" · ")}
                </option>
              ))}
            </NativeSelect>
            <Label>Estabilidad: {stability.toFixed(2)} (más bajo = más dramático)</Label>
            <input type="range" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(Number(e.target.value))} />
            <Label>Estilo / exageración: {style.toFixed(2)}</Label>
            <input type="range" min={0} max={1} step={0.05} value={style} onChange={(e) => setStyle(Number(e.target.value))} />
            <Label>Aplicar desde el capítulo</Label>
            <NativeSelect value={fromChapter} onChange={(e) => setFromChapter(Number(e.target.value))}>
              {novela.chapters.map((ch) => (
                <option key={ch.number} value={ch.number}>
                  Capítulo {ch.number} {ch.status === "DONE" ? "(ya producido)" : ""}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">Los capítulos anteriores conservan el diseño y la voz actuales (cambio a mitad de historia).</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>
                Guardar versión
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy || c.approved || !v?.referenceImageUrl} onClick={() => act(() => api.approveCharacter(c.id), `${c.name} aprobado`)}>
              <Check /> Aprobar
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !v?.referenceImageUrl} onClick={() => act(() => api.regenerateCharacter(c.id), "Regenerando diseño con otra semilla…")}>
              <RefreshCw /> Regenerar
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || !v?.referenceImageUrl} onClick={() => setEditing(true)}>
              <Pencil /> Editar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
