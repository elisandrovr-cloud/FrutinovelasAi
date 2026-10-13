import Link from "next/link";
import { Clapperboard, History } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🍍</span>
          <span className="whitespace-nowrap font-display text-xl font-black italic">
            Fruti<span className="text-gradient">Novela</span> AI
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/novelas">
              <History /> <span className="hidden sm:inline">Mis frutinovelas</span>
            </Link>
          </Button>
          <Button variant="telenovela" size="sm" asChild>
            <Link href="/">
              <Clapperboard /> <span className="hidden sm:inline">Crear</span>
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
