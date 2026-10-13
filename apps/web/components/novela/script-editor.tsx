"use client";

import { useMemo, useState } from "react";
import { Braces, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CAMERA_SHOTS, ChapterScriptSchema, DELIVERIES, MUSIC_MOODS, TRANSITIONS } from "@fruti/shared";
import type { ChapterDTO, ChapterScript, NovelaDTO, Shot } from "@fruti/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface Props {
  novela: NovelaDTO;
  chapter: ChapterDTO;
  refresh: () => Promise<unknown>;
}

const pretty = (s: string) => s.replace(/_/g, " ");

/**
 * Editor de guion "simple": título, escenas, planos y diálogos editables en
 * formulario + modo JSON para usuarios avanzados. Al guardar se valida con el
 * mismo esquema Zod que usa la API.
 */
export function ScriptEditor({ novela, chapter, refresh }: Props) {
  const [draft, setDraft] = useState<ChapterScript | null>(chapter.script ? structuredClone(chapter.script) : null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = chapter.status === "RENDERING" || chapter.status === "QUEUED";

  const characters = novela.bible?.characters ?? [];
  const names = useMemo(() => Object.fromEntries(characters.map((c) => [c.key, c.name])), [characters]);
  const totalSec = draft?.scenes.reduce((a, s) => a + s.shots.reduce((b, sh) => b + sh.durationSec, 0), 0) ?? 0;

  if (!draft) {
    return (
      <Card className="grid place-items-center p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-muted-foreground">Escribiendo el capítulo {chapter.number}…</p>
        <p className="mt-2 max-w-md text-sm italic text-muted-foreground">{chapter.outline.synopsis}</p>
      </Card>
    );
  }

  const update = (fn: (d: ChapterScript) => void) =>
    setDraft((cur) => {
      const next = structuredClone(cur!);
      fn(next);
      return next;
    });
  const updateShot = (si: number, ki: number, fn: (s: Shot) => void) => update((d) => fn(d.scenes[si].shots[ki]));

  async function save() {
    let script = draft!;
    if (jsonMode) {
      try {
        script = JSON.parse(jsonText);
      } catch {
        return toast.error("JSON inválido");
      }
    }
    const parsed = ChapterScriptSchema.safeParse(script);
    if (!parsed.success) return toast.error(`Guion inválido: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    setSaving(true);
    try {
      const saved = await api.saveChapterScript(novela.id, chapter.number, parsed.data);
      setDraft(saved.script);
      setJsonMode(false);
      toast.success(chapter.status === "DONE" ? "Guardado. Vuelve a producir este capítulo para ver los cambios." : "Guion guardado");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    const cascade = chapter.number < novela.chapterCount && confirm("¿Reescribir también los capítulos siguientes para mantener la continuidad?\n\nAceptar = este y los siguientes · Cancelar = solo este");
    try {
      await api.regenerateChapterScript(novela.id, chapter.number, cascade);
      toast.success("Reescribiendo capítulo…");
      setTimeout(refresh, 1500);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardDescription>
              Capítulo {chapter.number} · {draft.scenes.length} escenas · {draft.scenes.reduce((a, s) => a + s.shots.length, 0)} planos · ~{Math.round(totalSec)} s
            </CardDescription>
            <CardTitle className="mt-1">
              <Input value={draft.title} disabled={locked} onChange={(e) => update((d) => void (d.title = e.target.value))} className="h-auto border-none p-0 font-display text-2xl font-bold shadow-none focus-visible:ring-0" />
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setJsonText(JSON.stringify(draft, null, 2));
                setJsonMode(!jsonMode);
              }}
            >
              <Braces /> {jsonMode ? "Formulario" : "JSON"}
            </Button>
            <Button variant="outline" size="sm" onClick={regenerate} disabled={locked}>
              <RefreshCw /> Reescribir
            </Button>
            <Button size="sm" onClick={save} disabled={saving || locked}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
            </Button>
          </div>
        </div>
        {draft.recap && (
          <div className="grid gap-1">
            <Label>Recap del narrador</Label>
            <Textarea rows={2} value={draft.recap} disabled={locked} onChange={(e) => update((d) => void (d.recap = e.target.value))} />
          </div>
        )}
      </CardHeader>

      <CardContent className="grid gap-6">
        {jsonMode ? (
          <Textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={30} className="font-mono text-xs" />
        ) : (
          draft.scenes.map((scene, si) => (
            <section key={si} className="grid gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-lg font-bold">Escena {scene.number}</span>
                <NativeSelect value={scene.setKey} disabled={locked} onChange={(e) => update((d) => void (d.scenes[si].setKey = e.target.value))} className="h-8 w-56 text-xs">
                  {novela.bible?.sets.map((s) => (
                    <option key={s.key} value={s.key}>
                      📍 {s.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect value={scene.music.mood} disabled={locked} onChange={(e) => update((d) => void (d.scenes[si].music.mood = e.target.value as never))} className="h-8 w-40 text-xs">
                  {MUSIC_MOODS.map((m) => (
                    <option key={m} value={m}>
                      🎵 {m}
                    </option>
                  ))}
                </NativeSelect>
                <span className="text-xs text-muted-foreground">{scene.timeOfDay}</span>
              </div>
              <Textarea rows={2} value={scene.description} disabled={locked} onChange={(e) => update((d) => void (d.scenes[si].description = e.target.value))} className="text-sm" />

              {scene.shots.map((shot, ki) => (
                <div key={ki} className="grid gap-3 rounded-md border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-primary px-2 py-0.5 font-bold text-primary-foreground">Plano {shot.number}</span>
                    <NativeSelect value={shot.camera} disabled={locked} onChange={(e) => updateShot(si, ki, (s) => void (s.camera = e.target.value as never))} className="h-8 w-48 text-xs">
                      {CAMERA_SHOTS.map((c) => (
                        <option key={c} value={c}>
                          🎥 {pretty(c)}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect value={shot.durationSec} disabled={locked} onChange={(e) => updateShot(si, ki, (s) => void (s.durationSec = Number(e.target.value)))} className="h-8 w-24 text-xs">
                      <option value={5}>5 s</option>
                      <option value={10}>10 s</option>
                    </NativeSelect>
                    <NativeSelect value={shot.transitionOut} disabled={locked} onChange={(e) => updateShot(si, ki, (s) => void (s.transitionOut = e.target.value as never))} className="h-8 w-40 text-xs">
                      {TRANSITIONS.map((t) => (
                        <option key={t} value={t}>
                          ↪ {pretty(t)}
                        </option>
                      ))}
                    </NativeSelect>
                    <span className="text-muted-foreground">{shot.charactersOnScreen.map((k) => names[k] ?? k).join(", ")}</span>
                  </div>
                  <Textarea rows={2} value={shot.action} disabled={locked} onChange={(e) => updateShot(si, ki, (s) => void (s.action = e.target.value))} className="text-sm" placeholder="Acción física" />

                  {shot.dialogue.map((line, li) => (
                    <div key={li} className="grid gap-2 sm:grid-cols-[160px_1fr_130px_auto]">
                      <NativeSelect value={line.characterKey} disabled={locked} onChange={(e) => updateShot(si, ki, (s) => void (s.dialogue[li].characterKey = e.target.value))} className="h-9 text-xs font-semibold">
                        {characters.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.name}
                          </option>
                        ))}
                        <option value="narrador">Narrador</option>
                      </NativeSelect>
                      <Input value={line.text} disabled={locked} onChange={(e) => updateShot(si, ki, (s) => void (s.dialogue[li].text = e.target.value))} />
                      <NativeSelect value={line.delivery} disabled={locked} onChange={(e) => updateShot(si, ki, (s) => void (s.dialogue[li].delivery = e.target.value as never))} className="h-9 text-xs">
                        {DELIVERIES.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </NativeSelect>
                      <Button variant="ghost" size="icon" disabled={locked} onClick={() => updateShot(si, ki, (s) => void s.dialogue.splice(li, 1))} aria-label="Quitar línea">
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-self-start"
                    disabled={locked}
                    onClick={() =>
                      updateShot(si, ki, (s) =>
                        void s.dialogue.push({ characterKey: s.charactersOnScreen[0] ?? characters[0]?.key ?? "narrador", text: "", emotion: "dramática", delivery: "normal" }),
                      )
                    }
                  >
                    <Plus /> Línea de diálogo
                  </Button>
                </div>
              ))}
            </section>
          ))
        )}
        <div className="rounded-lg border-2 border-dashed border-primary/40 p-4">
          <Label>🪝 Cliffhanger</Label>
          <Textarea rows={2} value={draft.cliffhanger} disabled={locked} onChange={(e) => update((d) => void (d.cliffhanger = e.target.value))} className="mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}
