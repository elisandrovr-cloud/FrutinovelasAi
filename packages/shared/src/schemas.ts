/**
 * Esquemas Zod compartidos entre API (salidas estructuradas de Claude,
 * validación de requests) y frontend (tipos del editor de guion).
 *
 * Reglas para que funcionen como "structured outputs" de Claude:
 *  - Solo objetos, arrays, strings, numbers, booleans y enums.
 *  - Sin regex ni límites numéricos: las restricciones van en `.describe()`
 *    y se validan después en código (ver api/src/services/script.ts).
 */
import { z } from "zod/v4";

export const GENRES = [
  "drama",
  "romance",
  "traicion",
  "comedia",
  "suspenso",
  "venganza",
  "misterio",
  "familia",
  "accion",
] as const;
export const GenreSchema = z.enum(GENRES);
export type Genre = z.infer<typeof GenreSchema>;

export const MUSIC_MOODS = [
  "dramatica",
  "romantica",
  "suspenso",
  "comedia",
  "tristeza",
  "tension",
  "revelacion",
  "felicidad",
] as const;
export const MusicMoodSchema = z.enum(MUSIC_MOODS);
export type MusicMood = z.infer<typeof MusicMoodSchema>;

export const ACCENTS = [
  "mexicano",
  "colombiano",
  "venezolano",
  "argentino",
  "caribeno",
  "chileno",
  "neutro",
] as const;
export const AccentSchema = z.enum(ACCENTS);

export const CAMERA_SHOTS = [
  "plano_general",
  "plano_medio",
  "primer_plano",
  "primerisimo_primer_plano",
  "plano_detalle",
  "contrapicado",
  "picado",
  "plano_sobre_hombro",
  "travelling",
  "zoom_dramatico",
] as const;
export const CameraShotSchema = z.enum(CAMERA_SHOTS);

export const TRANSITIONS = ["corte", "fundido_negro", "disolvencia", "barrido", "flash_blanco"] as const;
export const TransitionSchema = z.enum(TRANSITIONS);

export const DELIVERIES = [
  "normal",
  "susurro",
  "grito",
  "sollozo",
  "risa",
  "sarcastico",
  "seductor",
  "temblorosa",
  "solemne",
] as const;
export const DeliverySchema = z.enum(DELIVERIES);

// ---------------------------------------------------------------------------
// Biblia de la historia (paso 1 de generación)
// ---------------------------------------------------------------------------

export const CharacterVisualSchema = z.object({
  bodyShape: z.string().describe("Silueta y proporciones de la fruta antropomorfa, p.ej. 'piña alta y esbelta, corona de 7 hojas puntiagudas'"),
  palette: z.array(z.string()).describe("3-5 colores hex dominantes del personaje, p.ej. ['#F4C430', '#2E8B57']"),
  surface: z.string().describe("Textura de la piel de la fruta (rugosa, brillante, con semillas, etc.)"),
  face: z.string().describe("Rasgos faciales: forma de ojos, color de iris, cejas, boca, pestañas, marcas distintivas"),
  hairOrLeaves: z.string().describe("Peinado, hojas o tallo que funciona como cabello"),
  outfit: z.string().describe("Vestuario principal, MUY específico (prenda, color, material, detalles)"),
  accessories: z.array(z.string()).describe("Accesorios fijos que siempre lleva"),
  signatureExpression: z.string().describe("Expresión facial o pose característica"),
  promptEn: z
    .string()
    .describe("El MISMO diseño en un solo párrafo en INGLÉS para modelos de imagen (60-90 palabras, sin nombres propios): fruta, forma, colores hex, cara, ojos, hojas/peinado, vestuario exacto y accesorios"),
});

export const VoiceProfileSchema = z.object({
  gender: z.enum(["femenina", "masculina", "neutra"]),
  ageRange: z.enum(["nino", "joven", "adulto", "mayor"]),
  timbre: z.string().describe("Timbre de voz: grave, aguda, rasposa, aterciopelada..."),
  energy: z.enum(["baja", "media", "alta"]),
  accent: AccentSchema,
});

export const BibleCharacterSchema = z.object({
  key: z.string().describe("Identificador corto en minúsculas sin espacios, p.ej. 'pina_paloma'"),
  name: z.string().describe("Nombre telenovelesco, p.ej. 'Piña Paloma de la Corona'"),
  fruit: z.string().describe("Fruta en español, p.ej. 'piña'"),
  role: z.string().describe("Rol dramático: protagonista, galán, villana, mejor amiga, madre, comic relief..."),
  age: z.string(),
  personality: z.string(),
  speakingStyle: z.string().describe("Cómo habla: muletillas, ritmo, vocabulario"),
  catchphrase: z.string(),
  voice: VoiceProfileSchema,
  visual: CharacterVisualSchema,
  arc: z.string().describe("Arco del personaje a lo largo de toda la novela"),
});
export type BibleCharacter = z.infer<typeof BibleCharacterSchema>;

export const SetLocationSchema = z.object({
  key: z.string().describe("Identificador corto del escenario, p.ej. 'hacienda_salon'"),
  name: z.string(),
  description: z.string().describe("Descripción visual fija del escenario para reutilizarla en todos los capítulos"),
  promptEn: z.string().describe("La misma descripción en INGLÉS para modelos de imagen (40-70 palabras): arquitectura, materiales, colores, utilería fija, luz"),
});
export type SetLocation = z.infer<typeof SetLocationSchema>;

export const ChapterOutlineSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  synopsis: z.string(),
  keyEvents: z.array(z.string()),
  cliffhanger: z.string().describe("Gancho final del capítulo; vacío solo en el capítulo final"),
});
export type ChapterOutline = z.infer<typeof ChapterOutlineSchema>;

export const StoryBibleSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  logline: z.string(),
  setting: z.string().describe("Mundo de la historia, p.ej. 'Hacienda Los Frutales, pueblo tropical ficticio'"),
  tone: z.string(),
  characters: z.array(BibleCharacterSchema),
  sets: z.array(SetLocationSchema),
  chapters: z.array(ChapterOutlineSchema),
});
export type StoryBible = z.infer<typeof StoryBibleSchema>;

// ---------------------------------------------------------------------------
// Guion de capítulo (paso 2, uno por capítulo, encadenado)
// ---------------------------------------------------------------------------

export const DialogueLineSchema = z.object({
  characterKey: z.string().describe("key del personaje o 'narrador'"),
  text: z.string(),
  emotion: z.string().describe("Emoción concreta: celos contenidos, furia, desconsuelo, ternura..."),
  delivery: DeliverySchema,
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const ShotSchema = z.object({
  number: z.number().int(),
  durationSec: z.number().describe("5 o 10 segundos (duraciones soportadas por los modelos de video)"),
  camera: CameraShotSchema,
  charactersOnScreen: z.array(z.string()).describe("keys de los personajes visibles"),
  action: z.string().describe("Acción física concreta y animable: quién se mueve, cómo, hacia dónde"),
  expressions: z.string().describe("Expresiones faciales exageradas de cada personaje en pantalla"),
  visualPromptEn: z
    .string()
    .describe("Descripción en INGLÉS del plano para el modelo de video (30-60 palabras): encuadre, quién está dónde (usa los keys), acción física, movimiento de cámara, expresión. Sin diálogos"),
  dialogue: z.array(DialogueLineSchema),
  sfx: z.array(z.string()).describe("Efectos de sonido, p.ej. 'portazo', 'trueno', 'cachetada'"),
  transitionOut: TransitionSchema,
});
export type Shot = z.infer<typeof ShotSchema>;

export const SceneSchema = z.object({
  number: z.number().int(),
  setKey: z.string().describe("key de un escenario de la biblia"),
  timeOfDay: z.enum(["amanecer", "dia", "atardecer", "noche"]),
  weather: z.string(),
  description: z.string(),
  music: z.object({ mood: MusicMoodSchema, intensity: z.enum(["baja", "media", "alta"]) }),
  shots: z.array(ShotSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const CharacterStateSchema = z.object({
  characterKey: z.string(),
  location: z.string(),
  emotion: z.string(),
  physicalState: z.string().describe("Postura, heridas, lágrimas, objetos en mano, cambios de ropa"),
});

export const ChapterScriptSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  recap: z.string().describe("Frase del narrador 'En el capítulo anterior...' (vacía en el capítulo 1)"),
  scenes: z.array(SceneSchema),
  cliffhanger: z.string(),
  endState: z.object({
    summary: z.string().describe("Qué pasó exactamente en este capítulo, en 3-5 frases"),
    lastFrame: z.string().describe("Descripción precisa del último fotograma: encuadre, quién, dónde, pose, expresión, luz"),
    characters: z.array(CharacterStateSchema),
  }),
});
export type ChapterScript = z.infer<typeof ChapterScriptSchema>;

// ---------------------------------------------------------------------------
// Requests de la API
// ---------------------------------------------------------------------------

export const CreateNovelaSchema = z.object({
  prompt: z.string().min(10).max(2000),
  genres: z.array(GenreSchema).min(1).max(4),
  chapterCount: z.number().int().min(8).max(12),
  totalMinutes: z.number().min(12).max(30),
  aspectRatio: z.enum(["16:9", "9:16"]).default("9:16"),
  subtitles: z.boolean().default(true),
  accent: AccentSchema.default("mexicano"),
});
export type CreateNovelaInput = z.infer<typeof CreateNovelaSchema>;

export const UpdateCharacterSchema = z.object({
  name: z.string().optional(),
  personality: z.string().optional(),
  speakingStyle: z.string().optional(),
  visual: CharacterVisualSchema.partial().optional(),
  voiceId: z.string().optional(),
  voiceSettings: z
    .object({
      stability: z.number().min(0).max(1),
      similarityBoost: z.number().min(0).max(1),
      style: z.number().min(0).max(1),
    })
    .partial()
    .optional(),
  /** Capítulo desde el que aplica el cambio (cambio a mitad de historia). */
  effectiveFromChapter: z.number().int().min(1).optional(),
});
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;
