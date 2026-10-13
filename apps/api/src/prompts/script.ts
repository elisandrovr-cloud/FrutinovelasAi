/**
 * PROMPTS MAESTROS DE GUION
 *
 * Generación en dos fases (ver docs/02-PROMPTS-MAESTROS.md):
 *  1. Biblia: personajes, escenarios y escaleta de TODOS los capítulos en una sola
 *     llamada → garantiza un arco completo y cliffhangers planificados.
 *  2. Capítulo N: guion plano a plano, recibiendo la biblia + el endState exacto
 *     del capítulo N-1 → continuidad narrativa perfecta y capítulos editables uno a uno.
 *
 * El system prompt es estable byte a byte para aprovechar prompt caching.
 */
import { FRUIT_CATALOG } from "@fruti/shared";
import type { ChapterOutline, ChapterScript, CreateNovelaInput, StoryBible } from "@fruti/shared";

export const SCRIPTWRITER_SYSTEM = `Eres "La Pluma de Oro", guionista estrella de telenovelas latinoamericanas (escuela Televisa, Caracol y RCN) reconvertida en showrunner de FRUTINOVELAS: telenovelas cortas protagonizadas por frutas antropomorfas animadas en 3D estilo Pixar, pensadas para volverse virales en TikTok, Reels y YouTube Shorts.

## Tu sello
- Melodrama sin vergüenza: celos, traiciones, secretos de familia, hijos perdidos, gemelas malvadas, bodas interrumpidas, amnesias, herencias, cachetadas épicas.
- Diálogos con sabor de telenovela mexicana/colombiana: frases lapidarias ("¡Tú no eres más que una fruta trepadora!"), pausas dramáticas marcadas con puntos suspensivos, exclamaciones, ironía y juegos de palabras frutales ("me dejaste la cáscara del corazón", "eres más ácida que un limón en ayunas").
- Humor involuntario por el contraste entre el drama extremo y que todos son frutas. Nunca rompes la cuarta pared ni te burlas del género: los personajes se lo toman MUY en serio.
- Cada capítulo empieza exactamente donde terminó el anterior y termina en un cliffhanger (revelación, llegada inesperada, pregunta sin respuesta, peligro). El capítulo final cierra todos los arcos con un giro satisfactorio.
- Contenido apto para todo público: el drama es emocional, la violencia es slapstick de caricatura (cachetadas, empujones, desmayos), sin sangre, sin sexo, sin insultos fuertes.

## Reglas de producción (el guion alimenta modelos de IA de video)
- Cada plano dura 5 o 10 segundos. Un plano = una acción física clara y animable (caminar hacia, girar la cabeza, abofetear, abrazar, desmayarse, llorar, señalar, romper un objeto). Evita acciones simultáneas complejas o multitudes.
- Máximo 3 personajes en pantalla por plano; preferir 1–2 en primeros planos para que el lip-sync funcione.
- Velocidad de habla: como máximo 2.3 palabras por segundo de plano. Un plano de 5 s admite ~11 palabras de diálogo; uno de 10 s, ~23. Si una réplica es más larga, divídela en varios planos (plano/contraplano).
- Describe expresiones exageradas y legibles (ojos llorosos enormes, ceja levantada, mandíbula temblando).
- En visualPromptEn describe cualquier golpe como slapstick de caricatura ("cartoon slap with comic stars", "dramatic cartoon faint"): los modelos de video rechazan la violencia realista.
- Reutiliza los escenarios definidos en la biblia (setKey). No inventes escenarios nuevos en los capítulos.
- Las transiciones: "corte" por defecto; "fundido_negro" para saltos de tiempo; "flash_blanco" para revelaciones; "barrido" para comedia.
- Usa SFX concretos y cortos ("cachetada", "trueno", "vidrio rompiéndose", "suspiro colectivo", "campanas de iglesia", "zoom dramático").
- La música por escena define la emoción: dramatica, romantica, suspenso, comedia, tristeza, tension, revelacion, felicidad.

## Consistencia
- Los nombres, keys, frutas, vestuarios y personalidades de la biblia son canon. Nunca cambies el vestuario de un personaje salvo que la trama lo pida explícitamente, y en ese caso indícalo en physicalState del endState.
- Responde SIEMPRE en español latinoamericano, con el JSON exacto que se te pide.`;

const FRUIT_HINTS = FRUIT_CATALOG.map((f) => `- ${f.fruit}: ${f.anatomy}. Arquetipos: ${f.archetypes.join(", ")}`).join("\n");

export function biblePrompt(input: CreateNovelaInput) {
  const secondsPerChapter = Math.round((input.totalMinutes * 60) / input.chapterCount);
  return `Crea la BIBLIA completa de una frutinovela nueva.

## Idea del usuario
"""${input.prompt}"""

## Parámetros
- Géneros: ${input.genres.join(", ")}
- Número de capítulos: EXACTAMENTE ${input.chapterCount}
- Duración total aproximada: ${input.totalMinutes} minutos (~${secondsPerChapter} s por capítulo)
- Acento predominante de las voces: ${input.accent}
- Formato: ${input.aspectRatio === "9:16" ? "vertical 9:16 (redes sociales)" : "horizontal 16:9"}

## Catálogo de frutas disponibles (puedes usar otras si la idea lo pide)
${FRUIT_HINTS}

## Instrucciones
1. Personajes: entre 4 y 7. Respeta las frutas que mencione el usuario. Incluye al menos: protagonista, interés amoroso, antagonista y un personaje de alivio cómico. Cada uno con un diseño visual MUY concreto y distinguible por silueta y color (dos personajes nunca comparten paleta dominante). El vestuario debe ser icónico y fácil de reproducir por IA (prendas simples, colores sólidos, 1–3 accesorios fijos).
2. Voz: define género, edad, timbre, energía y acento de cada personaje para elegir una voz de IA coherente.
3. Escenarios: entre 4 y 7 escenarios reutilizables (hacienda, cocina, iglesia, hospital, mercado, playa...), descritos con detalle visual fijo (materiales, colores, luz).
4. Escaleta: EXACTAMENTE ${input.chapterCount} capítulos numerados desde 1. Estructura:
   - Cap. 1: presentación + detonante + primer cliffhanger fuerte en los primeros 20 s ya hay conflicto.
   - Capítulos intermedios: escalada, al menos una traición, un secreto revelado a mitad de la historia y un falso final feliz antes del clímax.
   - Penúltimo: el momento más oscuro.
   - Último: clímax + resolución + epílogo con un último giro cómico. Su cliffhanger va vacío.
   - Cada keyEvents con 3–5 eventos concretos y filmables.
5. Título de telenovela clásica (p.ej. "Corazón de Piña", "La Fresa Prohibida") y un tagline viral.`;
}

export function chapterPrompt(p: {
  bible: StoryBible;
  outline: ChapterOutline;
  previous: ChapterScript | null;
  targetSeconds: number;
  totalChapters: number;
}) {
  const { bible, outline, previous, targetSeconds, totalChapters } = p;
  const shotsHint = `${Math.round(targetSeconds / 8)}–${Math.round(targetSeconds / 6)}`;
  const nextOutline = bible.chapters.find((c) => c.number === outline.number + 1);

  const continuity = previous
    ? `## CONTINUIDAD OBLIGATORIA (capítulo ${previous.number} terminó así)
Resumen: ${previous.endState.summary}
Último fotograma: ${previous.endState.lastFrame}
Cliffhanger pendiente: ${previous.cliffhanger}
Estado de cada personaje:
${previous.endState.characters.map((c) => `- ${c.characterKey}: en ${c.location}; emoción: ${c.emotion}; estado físico: ${c.physicalState}`).join("\n")}

El PRIMER plano de este capítulo debe arrancar en el mismo escenario, con los mismos personajes, posiciones y emociones del último fotograma, y resolver o prolongar el cliffhanger. El campo "recap" es una frase de narrador de máximo 25 palabras: "En el capítulo anterior de ${bible.title}..."`
    : `## Este es el capítulo 1
"recap" va vacío. Los primeros 10 segundos deben enganchar: arranca en plena acción o con una frase lapidaria.`;

  return `Escribe el guion de producción completo del CAPÍTULO ${outline.number} de ${totalChapters} de "${bible.title}".

## Biblia (canon)
${JSON.stringify(
  {
    logline: bible.logline,
    setting: bible.setting,
    tone: bible.tone,
    characters: bible.characters.map((c) => ({
      key: c.key,
      name: c.name,
      fruit: c.fruit,
      role: c.role,
      personality: c.personality,
      speakingStyle: c.speakingStyle,
      catchphrase: c.catchphrase,
      outfit: c.visual.outfit,
      arc: c.arc,
    })),
    sets: bible.sets.map((s) => ({ key: s.key, name: s.name })),
  },
  null,
  2,
)}

## Escaleta de este capítulo
${JSON.stringify(outline, null, 2)}
${nextOutline ? `\n## Lo que viene después (para sembrar, NO para contar)\nCapítulo ${nextOutline.number}: ${nextOutline.synopsis}` : "\n## Es el capítulo FINAL: cierra todos los arcos."}

${continuity}

## Requisitos de forma
- Duración objetivo: ${targetSeconds} s. La suma de durationSec de todos los planos debe estar entre ${Math.round(targetSeconds * 0.9)} y ${Math.round(targetSeconds * 1.1)}.
- Entre 3 y 6 escenas, ${shotsHint} planos en total. Numera escenas y planos desde 1 (planos numerados dentro de cada escena).
- Cada personaje habla con su speakingStyle; usa su catchphrase como máximo una vez por capítulo.
- Usa characterKey "narrador" solo si hace falta una voz en off.
- El último plano muestra el cliffhanger y su transitionOut es "fundido_negro".
- endState.lastFrame describe con precisión el último plano (encuadre, personajes, posición, expresión, luz) porque será la imagen inicial del capítulo siguiente.
- endState.characters incluye a TODOS los personajes de la biblia (aunque no hayan salido).`;
}
