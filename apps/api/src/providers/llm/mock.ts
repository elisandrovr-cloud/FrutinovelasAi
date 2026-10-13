/**
 * Guionista "mock": genera biblia y capítulos deterministas sin llamar a ninguna
 * API. Sirve para desarrollar la UI y probar el pipeline de video de punta a punta.
 */
import { FRUIT_CATALOG } from "@fruti/shared";
import type { BibleCharacter, ChapterOutline, ChapterScript, CreateNovelaInput, StoryBible } from "@fruti/shared";

const PALETTES = [
  ["#F4C430", "#2E8B57", "#8B5A2B"],
  ["#FF8C1A", "#E0402A", "#FFD23F"],
  ["#E3243B", "#FFD700", "#2FA84F"],
  ["#2E7D32", "#E53935", "#1B1B1B"],
  ["#FFE135", "#6B4F1D", "#FFFFFF"],
  ["#6A1B9A", "#9C4DCC", "#2E7D32"],
];
const ROLES = ["protagonista", "galán", "villana", "comic relief", "madre sobreprotectora", "mejor amiga"];

export function mockBible(input: CreateNovelaInput): StoryBible {
  const lower = input.prompt.toLowerCase();
  const mentioned = FRUIT_CATALOG.filter((f) => lower.includes(f.fruit));
  const fruits = [...mentioned, ...FRUIT_CATALOG.filter((f) => !mentioned.includes(f))].slice(0, 5);

  const characters: BibleCharacter[] = fruits.map((f, i) => {
    const key = `${f.fruit.normalize("NFD").replace(/[̀-ͯ]/g, "")}_${i + 1}`;
    const outfit = ["vestido de seda rojo con hombreras", "guayabera blanca con sombrero vueltiao", "vestido rosa de encaje con perlas", "traje negro con capa morada", "uniforme de mayordomo azul"][i % 5];
    return {
      key,
      name: `${cap(f.fruit)} ${["Paloma", "Alejandro", "Fresita", "Dolores", "Panchito"][i % 5]}`,
      fruit: f.fruit,
      role: ROLES[i % ROLES.length],
      age: ["25", "30", "22", "50", "40"][i % 5],
      personality: f.archetypes[0],
      speakingStyle: "Habla con pausas dramáticas y exclamaciones",
      catchphrase: ["¡Esto no se va a quedar así!", "Mi corazón es tuyo, mi reina", "Yo solo quiero ser feliz…", "¡Sobre mi cáscara!", "¡Ay, qué chisme más jugoso!"][i % 5],
      voice: { gender: i % 2 ? "masculina" : "femenina", ageRange: "adulto", timbre: "aterciopelada", energy: "alta", accent: input.accent },
      visual: {
        bodyShape: f.anatomy,
        palette: PALETTES[i % PALETTES.length],
        surface: "piel brillante estilizada",
        face: "ojos enormes con pestañas largas, cejas expresivas",
        hairOrLeaves: "hojas o tallo como peinado",
        outfit,
        accessories: ["aretes dorados"],
        signatureExpression: "ceja levantada",
        promptEn: `anthropomorphic ${f.fruit} with ${PALETTES[i % PALETTES.length].join(" and ")} colors, big expressive eyes, long eyelashes, wearing ${outfit}, golden earrings`,
      },
      arc: "De la ingenuidad a la venganza y finalmente al perdón",
    };
  });

  const sets = [
    { key: "hacienda_salon", name: "Salón de la Hacienda Los Frutales", description: "Salón colonial con candelabro", promptEn: "colonial hacienda living room, terracotta floor, crystal chandelier, red velvet curtains" },
    { key: "mercado", name: "Mercado del pueblo", description: "Puestos de colores", promptEn: "colorful tropical street market with fruit stalls and papel picado" },
    { key: "iglesia", name: "Iglesia de San Frutal", description: "Iglesia blanca con flores", promptEn: "white colonial church interior with flowers and stained glass" },
    { key: "playa", name: "Playa Mango Bay", description: "Playa de arena dorada", promptEn: "golden sand beach at sunset with palm trees" },
  ];

  const chapters: ChapterOutline[] = Array.from({ length: input.chapterCount }, (_, i) => ({
    number: i + 1,
    title: ["El Secreto de la Corona", "Celos de Temporada", "La Boda Interrumpida", "Jugo de Venganza", "La Verdad Madura", "Corazón en Almíbar", "La Cáscara Rota", "El Regreso", "Traición en el Mercado", "Lágrimas de Azúcar", "El Último Bocado", "Dulce Final"][i % 12],
    synopsis: `Capítulo ${i + 1}: el triángulo amoroso entre ${characters[0].name}, ${characters[1].name} y ${characters[2].name} se complica.`,
    keyEvents: ["Una confrontación", "Un secreto sale a la luz", "Una amenaza"],
    cliffhanger: i === input.chapterCount - 1 ? "" : "Alguien inesperado aparece en la puerta…",
  }));

  return {
    title: `Corazón de ${cap(fruits[0].fruit)}`,
    tagline: "El amor más jugoso… y la traición más ácida",
    logline: input.prompt,
    setting: "Hacienda Los Frutales, pueblo tropical ficticio",
    tone: "Melodrama exagerado con humor involuntario",
    characters,
    sets,
    chapters,
  };
}

export function mockChapter(bible: StoryBible, outline: ChapterOutline, targetSeconds: number, prev: ChapterScript | null): ChapterScript {
  const [a, b, c] = bible.characters;
  const shotsPerScene = Math.max(2, Math.round(targetSeconds / 10 / 3));
  const scenes = [0, 1, 2].map((s) => ({
    number: s + 1,
    setKey: bible.sets[(outline.number + s) % bible.sets.length].key,
    timeOfDay: (["dia", "atardecer", "noche"] as const)[s],
    weather: "despejado",
    description: `Escena ${s + 1} del capítulo ${outline.number}`,
    music: { mood: (["dramatica", "romantica", "suspenso"] as const)[s], intensity: "media" as const },
    shots: Array.from({ length: shotsPerScene }, (_, k) => {
      const speaker = [a, b, c][(k + s) % 3];
      const other = [a, b, c][(k + s + 1) % 3];
      return {
        number: k + 1,
        durationSec: k % 2 ? 5 : 10,
        camera: (["plano_medio", "primer_plano", "plano_general", "zoom_dramatico"] as const)[k % 4],
        charactersOnScreen: [speaker.key, other.key],
        action: `${speaker.name} se acerca a ${other.name} con dramatismo`,
        expressions: "ojos llorosos, ceja levantada",
        visualPromptEn: `${speaker.key.toUpperCase()} walks toward ${other.key.toUpperCase()} dramatically, pointing a finger`,
        dialogue: [
          { characterKey: speaker.key, text: k === 0 ? speaker.catchphrase : "¿Cómo pudiste hacerme esto… a mí?", emotion: "furia contenida", delivery: (k % 2 ? "grito" : "normal") as "grito" | "normal" },
          { characterKey: other.key, text: "Tú no sabes nada de mi corazón.", emotion: "desafío", delivery: "sarcastico" as const },
        ],
        sfx: k === 0 ? ["trueno"] : [],
        transitionOut: (k === shotsPerScene - 1 ? "fundido_negro" : "corte") as "fundido_negro" | "corte",
      };
    }),
  }));
  return {
    number: outline.number,
    title: outline.title,
    recap: prev ? `En el capítulo anterior de ${bible.title}… ${prev.cliffhanger}` : "",
    scenes,
    cliffhanger: outline.cliffhanger,
    endState: {
      summary: outline.synopsis,
      lastFrame: `${a.name} mira a cámara con lágrimas en los ojos en ${bible.sets[0].name}`,
      characters: bible.characters.map((ch) => ({ characterKey: ch.key, location: bible.sets[0].name, emotion: "conmoción", physicalState: "de pie" })),
    },
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
