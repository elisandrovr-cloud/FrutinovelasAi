# 🍍 FrutiNovela AI

Genera **frutinovelas**: telenovelas cortas protagonizadas por frutas antropomorfas en 3D estilo Pixar, de ~20 minutos, divididas en 8–12 capítulos de 1,5–3 min que continúan exactamente donde terminó el anterior y acaban en cliffhanger. Listas para TikTok, Reels, YouTube Shorts o como un solo video largo.

```
idea → guion (Claude) → personajes (FLUX) → por cada plano: imagen clave → video (Runway/Kling) → voces (ElevenLabs) → lip-sync → montaje (ffmpeg) → playlist / ZIP / serie vertical
```

## Qué incluye

- **Monorepo TypeScript**: `apps/web` (Next.js 14 + Tailwind + shadcn/ui), `apps/api` (Fastify + BullMQ + Prisma/PostgreSQL + R2/S3), `packages/shared` (esquemas Zod compartidos).
- **Guion en dos fases** con salidas estructuradas de Claude: biblia (personajes, escenarios, escaleta con cliffhangers) + capítulos plano a plano encadenados por `endState`. Editor de guion y reescritura por capítulo (con cascada).
- **Personajes como assets reutilizables**: hoja de referencia con semilla fija, hoja de giro, hoja de expresiones, ADN textual congelado y voz asignada. Aprobar / regenerar / editar **a mitad de la historia** (versiones con `effectiveFromChapter`).
- **Producción secuencial** con colas: “Generar todos los videos en secuencia” o “solo el siguiente”, progreso en vivo, pausa, reanudación tras fallos, degradación elegante si un plano es rechazado.
- **Post-producción**: voces por réplica con emoción, SFX, música de telenovela por escena con ducking, −14 LUFS, cartela con recap narrado, “Continuará…”, subtítulos SRT/VTT, versión 9:16.
- **Exportaciones**: ZIP completo, serie vertical numerada con captions, video largo único.
- **Modo mock** en todos los proveedores: el pipeline completo corre en local sin claves.

## Inicio rápido

```bash
npm install
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
npm run db:migrate
npm run dev:api      # terminal 1
npm run dev:worker   # terminal 2
npm run dev:web      # terminal 3 → http://localhost:3000
```

## Documentación

1. [Arquitectura, estructura de carpetas, esquema de BD y API](docs/01-ARQUITECTURA.md)
2. [Prompts maestros: guion, personajes, video, voces, música](docs/02-PROMPTS-MAESTROS.md)
3. [Sistema de continuidad entre videos](docs/03-CONTINUIDAD.md)
4. [Despliegue: local, Docker, Vercel + Supabase + R2 + Railway/Fly](docs/04-DESPLIEGUE.md)

## Mapa del código

| Qué | Dónde |
|---|---|
| Esquemas (guion, biblia, requests) | `packages/shared/src/schemas.ts` |
| Style lock y catálogo de frutas | `packages/shared/src/constants.ts` |
| Esquema de base de datos | `apps/api/prisma/schema.prisma` |
| Endpoints | `apps/api/src/routes/index.ts` |
| Máquina de estados | `apps/api/src/services/orchestrator.ts` |
| Pipeline de capítulo | `apps/api/src/services/production.ts` |
| Continuidad | `apps/api/src/services/continuity.ts` |
| Prompts maestros | `apps/api/src/prompts/` |
| Adaptadores de IA | `apps/api/src/providers/` |
| Montaje ffmpeg | `apps/api/src/lib/ffmpeg.ts` |
| Páginas | `apps/web/app/` |
| Pantallas del workspace | `apps/web/components/novela/` |
