import { CreateNovelaForm } from "@/components/novela/create-form";

const FLOATING = ["🍍", "🥭", "🍓", "🍉", "🍌", "🍇", "🥑", "🍋"];

export default function HomePage() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <section className="relative pt-6 lg:sticky lg:top-24">
        <div className="pointer-events-none absolute -top-4 right-0 hidden gap-3 text-4xl opacity-80 lg:flex">
          {FLOATING.map((f, i) => (
            <span key={f} className="animate-float" style={{ animationDelay: `${i * 0.4}s` }}>
              {f}
            </span>
          ))}
        </div>
        <p className="mb-3 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase tracking-widest text-secondary-foreground">
          Telenovelas virales con IA
        </p>
        <h1 className="font-display text-5xl font-black leading-[1.05] tracking-tight md:text-6xl">
          Crea tu <span className="text-gradient italic">FrutiNovela</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Escribe una idea y la IA escribe el guion, diseña a tus frutas, les pone voz con acento latino y produce una historia de ~20 minutos en
          capítulos encadenados, cada uno terminando en cliffhanger.
        </p>
        <ol className="mt-8 grid max-w-xl gap-3 text-sm">
          {[
            ["📝", "Guion completo", "Biblia, escaleta y capítulos plano a plano. Editable."],
            ["🎨", "Personajes consistentes", "Hoja de referencia, giro y expresiones; aprueba o regenera."],
            ["🎬", "Videos en secuencia", "Cada capítulo arranca en el último fotograma del anterior."],
            ["📱", "Listo para redes", "Partes 9:16 para TikTok/Reels/Shorts o un solo video largo."],
          ].map(([icon, title, desc]) => (
            <li key={title} className="flex gap-3 rounded-lg border bg-card/70 p-3 backdrop-blur">
              <span className="text-2xl">{icon}</span>
              <span>
                <b>{title}.</b> <span className="text-muted-foreground">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <CreateNovelaForm />
    </div>
  );
}
