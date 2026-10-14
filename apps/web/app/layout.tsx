import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import { ServerStatus } from "@/components/server-status";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Playfair_Display({ subsets: ["latin"], weight: ["700", "800", "900"], style: ["normal", "italic"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "FrutiNovela AI — Telenovelas de frutas con IA",
  description: "Crea frutinovelas de 20 minutos en capítulos listos para TikTok, Reels y YouTube Shorts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-telenovela font-sans">
        <SiteHeader />
        <ServerStatus />
        <main className="container pb-24 pt-8">{children}</main>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
