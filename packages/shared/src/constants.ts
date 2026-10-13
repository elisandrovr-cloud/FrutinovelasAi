/**
 * Catálogo de frutas y "style lock" global. El style lock es el mismo texto,
 * byte a byte, en TODOS los prompts de imagen y video de una novela: es la
 * primera pieza del sistema de continuidad (ver docs/03-CONTINUIDAD.md).
 */

export interface FruitArchetype {
  fruit: string;
  emoji: string;
  /** Rasgos anatómicos que nunca cambian para esa fruta. */
  anatomy: string;
  /** Arquetipos telenovelescos que encajan con la fruta. */
  archetypes: string[];
}

export const FRUIT_CATALOG: FruitArchetype[] = [
  { fruit: "piña", emoji: "🍍", anatomy: "cuerpo ovalado con textura de rombos dorados, corona de hojas verdes puntiagudas como peinado", archetypes: ["celosa intensa", "matriarca orgullosa", "villana elegante"] },
  { fruit: "mango", emoji: "🥭", anatomy: "cuerpo en forma de riñón con degradado rojo-naranja-amarillo, piel lisa y brillante, pequeño tallo con una hoja", archetypes: ["galán irresistible", "mujeriego arrepentido"] },
  { fruit: "fresa", emoji: "🍓", anatomy: "cuerpo cónico rojo intenso con semillas doradas, cáliz de hojas verdes como tocado", archetypes: ["dulce ingenua", "novia con secretos"] },
  { fruit: "sandía", emoji: "🍉", anatomy: "cuerpo grande y redondo con rayas verde oscuro y claro, aparece pulpa roja al abrir la boca", archetypes: ["madre sobreprotectora", "patrón de la hacienda"] },
  { fruit: "plátano", emoji: "🍌", anatomy: "cuerpo alargado y curvo amarillo con puntas marrones, tallo como sombrero", archetypes: ["comic relief", "mayordomo chismoso"] },
  { fruit: "uva", emoji: "🍇", anatomy: "cabeza formada por un racimo de uvas moradas brillantes, tallo verde en la coronilla", archetypes: ["hermana envidiosa", "gemelas intrigantes"] },
  { fruit: "manzana", emoji: "🍎", anatomy: "cuerpo redondo rojo brillante con reflejo especular, tallo marrón con una hoja", archetypes: ["abogada justiciera", "tentación prohibida"] },
  { fruit: "limón", emoji: "🍋", anatomy: "cuerpo ovalado amarillo ácido con poros visibles y puntas en los extremos", archetypes: ["suegra amargada", "rival sarcástica"] },
  { fruit: "aguacate", emoji: "🥑", anatomy: "cuerpo en forma de pera verde oscuro rugoso, vientre verde claro con hueso marrón visible", archetypes: ["doctor del pueblo", "padre bonachón"] },
  { fruit: "coco", emoji: "🥥", anatomy: "cuerpo esférico marrón peludo con tres 'ojos' característicos", archetypes: ["detective duro", "abuelo sabio"] },
  { fruit: "cereza", emoji: "🍒", anatomy: "dos cuerpos pequeños rojos unidos por tallos (gemelos)", archetypes: ["gemelos traviesos", "pareja inseparable"] },
  { fruit: "kiwi", emoji: "🥝", anatomy: "cuerpo ovalado marrón velloso, cara interior verde con semillas negras", archetypes: ["extranjero misterioso", "científico"] },
  { fruit: "naranja", emoji: "🍊", anatomy: "cuerpo esférico naranja con piel porosa y ombligo, hojita verde arriba", archetypes: ["amiga leal", "periodista"] },
  { fruit: "papaya", emoji: "🍈", anatomy: "cuerpo alargado verde-naranja, interior naranja con semillas negras", archetypes: ["curandera", "vecina chismosa"] },
  { fruit: "pitahaya", emoji: "🐉", anatomy: "cuerpo fucsia con escamas verdes curvas, interior blanco con puntos negros", archetypes: ["femme fatale", "heredera perdida"] },
];

/** En inglés: Flux, Runway y Kling siguen mejor las instrucciones visuales en inglés. */
export const VISUAL_STYLE_LOCK =
  "3D animated feature film still, Pixar / DreamWorks quality, soft global illumination, subsurface scattering on fruit skin, " +
  "vibrant saturated tropical colors, warm cinematic color grade with teal shadows, shallow depth of field, " +
  "anthropomorphic fruit characters with big glossy expressive eyes with catchlights, exaggerated telenovela facial expressions, " +
  "thin cartoon arms and legs in the fruit's color, white cartoon gloves, clean stylized materials, " +
  "no text, no watermark, no real humans";

export const NEGATIVE_STYLE =
  "photorealistic, live action, real humans, human skin, flat 2D anime, sketch, low resolution, blurry, deformed, " +
  "extra fingers, extra limbs, duplicated character, text, captions, subtitles, logo, watermark, " +
  "outfit change, different colors, different character design, inconsistent proportions";

export const ASPECT_RESOLUTIONS = {
  "16:9": { width: 1280, height: 720, runwayRatio: "1280:720", klingRatio: "16:9" },
  "9:16": { width: 720, height: 1280, runwayRatio: "720:1280", klingRatio: "9:16" },
} as const;
export type AspectRatio = keyof typeof ASPECT_RESOLUTIONS;

/** Estados del pipeline, compartidos con el frontend para la UI de progreso. */
export const NOVELA_STATUSES = [
  "DRAFT",
  "SCRIPTING",
  "SCRIPT_READY",
  "DESIGNING",
  "DESIGN_READY",
  "PRODUCING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
] as const;
export type NovelaStatus = (typeof NOVELA_STATUSES)[number];

export const CHAPTER_STATUSES = ["PENDING", "SCRIPTED", "QUEUED", "RENDERING", "DONE", "FAILED"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const STATUS_LABELS: Record<NovelaStatus, string> = {
  DRAFT: "Borrador",
  SCRIPTING: "Escribiendo guion…",
  SCRIPT_READY: "Guion listo",
  DESIGNING: "Diseñando personajes…",
  DESIGN_READY: "Personajes listos",
  PRODUCING: "Produciendo videos…",
  PAUSED: "En pausa",
  COMPLETED: "¡Terminada!",
  FAILED: "Error",
};
