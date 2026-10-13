/**
 * PROMPTS MAESTROS DE DISEÑO DE PERSONAJES
 *
 * El "ADN" de un personaje es un bloque de texto CONGELADO que se guarda en
 * CharacterVersion.dnaPrompt y se repite idéntico en cada imagen/video donde
 * aparece. Junto con la imagen de referencia (ancla visual) y la semilla fija,
 * es lo que mantiene al personaje igual durante los 20 minutos.
 */
import { VISUAL_STYLE_LOCK } from "@fruti/shared";
import type { BibleCharacter } from "@fruti/shared";

type Visual = BibleCharacter["visual"];

export function buildCharacterDNA(c: Pick<BibleCharacter, "key" | "fruit">, visual: Visual) {
  return [
    `[${c.key.toUpperCase()}] anthropomorphic ${fruitEn(c.fruit)} character.`,
    sentence(visual.promptEn),
    `Color palette: ${visual.palette.join(", ")}.`,
    `ALWAYS wears: ${visual.outfit}.`,
    visual.accessories.length ? `Fixed accessories: ${visual.accessories.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Imagen de referencia principal (texto → imagen, semilla fija). */
export function referenceSheetPrompt(dna: string) {
  return [
    "Character design reference, single character, full body, standing in a relaxed confident 3/4 front pose, centered,",
    "plain light gray studio background (#E9E6E1), soft even three-point lighting, entire body visible from head (including leaves/stem) to feet.",
    dna,
    "Neutral-friendly expression showing the face clearly.",
    VISUAL_STYLE_LOCK,
  ].join(" ");
}

/** Hoja de giro: edición a partir de la referencia (mismo personaje, otras vistas). */
export function turnaroundPrompt(dna: string) {
  return [
    "Using the character in the reference image, create a character turnaround model sheet:",
    "the exact same character shown 4 times in a row — front view, 3/4 view, side profile, back view — same scale, same lighting,",
    "plain light gray background. Keep design, proportions, colors, outfit and accessories IDENTICAL to the reference.",
    dna,
    VISUAL_STYLE_LOCK,
  ].join(" ");
}

/** Hoja de expresiones de telenovela, útil como referencia para primeros planos. */
export function expressionSheetPrompt(dna: string) {
  return [
    "Using the character in the reference image, create a 3x3 facial expression sheet, head and shoulders, plain light gray background:",
    "1 joyful laughing, 2 crying with huge tears, 3 furious shouting, 4 jealous side-eye with raised eyebrow, 5 shocked gasp with hand on mouth,",
    "6 lovestruck with sparkling eyes, 7 sarcastic smirk, 8 terrified, 9 dramatic fainting.",
    "The character must be IDENTICAL in every panel (same face, colors, leaves, outfit, accessories).",
    dna,
    VISUAL_STYLE_LOCK,
  ].join(" ");
}

export function setReferencePrompt(promptEn: string) {
  return [
    "Empty establishing shot of an animated film set, no characters,",
    promptEn,
    "Wide angle, eye level, readable layout so characters can be placed later.",
    VISUAL_STYLE_LOCK.replace(", no real humans", ""),
  ].join(" ");
}

const FRUIT_EN: Record<string, string> = {
  piña: "pineapple",
  mango: "mango",
  fresa: "strawberry",
  sandía: "watermelon",
  sandia: "watermelon",
  plátano: "banana",
  platano: "banana",
  banana: "banana",
  uva: "grape bunch",
  manzana: "apple",
  limón: "lemon",
  limon: "lemon",
  aguacate: "avocado",
  coco: "coconut",
  cereza: "cherry",
  kiwi: "kiwi",
  naranja: "orange",
  papaya: "papaya",
  pitahaya: "dragon fruit",
  guayaba: "guava",
  maracuyá: "passion fruit",
  maracuya: "passion fruit",
  durazno: "peach",
  melocotón: "peach",
  pera: "pear",
  granada: "pomegranate",
};

/** Asegura punto final: los prompts se concatenan y sin él las frases se mezclan. */
export function sentence(text: string) {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function fruitEn(fruit: string) {
  return FRUIT_EN[fruit.trim().toLowerCase()] ?? fruit;
}
