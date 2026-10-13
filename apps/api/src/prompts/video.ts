/**
 * PROMPTS MAESTROS DE PLANO (imagen clave + video)
 *
 * Estrategia "keyframe-first": nunca se genera video desde texto puro.
 *  1. Imagen clave: modelo de edición multi-imagen (FLUX Kontext multi) recibe
 *     [escenario, refs de personajes, (último fotograma previo)] + prompt de composición.
 *  2. Video: image-to-video (Runway Gen-4 / Kling) desde esa imagen clave con un
 *     prompt CORTO centrado en movimiento. La apariencia ya la fija la imagen; el
 *     prompt solo pide que no cambie.
 */
import { VISUAL_STYLE_LOCK } from "@fruti/shared";
import type { Scene, Shot } from "@fruti/shared";
import { sentence } from "./character";

const CAMERA: Record<Shot["camera"], { frame: string; move: string }> = {
  plano_general: { frame: "wide establishing shot", move: "slow cinematic push-in" },
  plano_medio: { frame: "medium shot, waist up", move: "subtle handheld drift" },
  primer_plano: { frame: "close-up on the face", move: "slow dolly-in" },
  primerisimo_primer_plano: { frame: "extreme close-up on the eyes", move: "very slow dramatic zoom-in" },
  plano_detalle: { frame: "detail insert shot", move: "static with rack focus" },
  contrapicado: { frame: "low-angle shot looking up", move: "slow tilt up" },
  picado: { frame: "high-angle shot looking down", move: "slow crane down" },
  plano_sobre_hombro: { frame: "over-the-shoulder shot", move: "gentle arc around" },
  travelling: { frame: "medium-wide tracking shot", move: "smooth lateral tracking following the action" },
  zoom_dramatico: { frame: "medium close-up", move: "fast telenovela crash zoom into the face" },
};

const LIGHT: Record<Scene["timeOfDay"], string> = {
  amanecer: "soft pink-gold sunrise light",
  dia: "bright warm tropical daylight",
  atardecer: "golden hour backlight with long warm shadows",
  noche: "moody blue moonlight with warm practical lamps",
};

export interface CastRef {
  key: string;
  dna: string;
  imageIndex: number; // posición de su referencia en image_urls (1-based para el prompt)
}

export function keyframePrompt(p: {
  scene: Scene;
  shot: Shot;
  setName: string;
  setPromptEn: string;
  setImageIndex: number | null;
  cast: CastRef[];
  continuityFromImageIndex: number | null;
  continuityNote: string | null;
}) {
  const cam = CAMERA[p.shot.camera];
  const castLines = p.cast.map((c) => `${c.key.toUpperCase()} = the character in image ${c.imageIndex}: ${c.dna}`);
  return [
    `Compose ONE cinematic frame from an animated telenovela. ${cam.frame}.`,
    p.setImageIndex ? `Location: the set from image ${p.setImageIndex} (${p.setName}).` : `Location: ${p.setName}.${p.setPromptEn ? " " + sentence(p.setPromptEn) : ""}`,
    p.continuityFromImageIndex
      ? `CONTINUITY: this frame continues directly from image ${p.continuityFromImageIndex}; keep the same positions, props, lighting and emotional state. ${p.continuityNote ?? ""}`
      : "",
    `Lighting: ${LIGHT[p.scene.timeOfDay]}, weather: ${p.scene.weather}.`,
    `Action: ${sentence(p.shot.visualPromptEn)}`,
    castLines.length ? `Cast (keep each design EXACTLY as in its reference image, same colors, outfit and accessories):\n${castLines.join("\n")}` : "",
    "Only the listed characters appear. Each character appears once.",
    VISUAL_STYLE_LOCK,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Prompt de movimiento para image-to-video. Corto: Runway admite ~1000 caracteres. */
export function videoMotionPrompt(p: { shot: Shot; speaking: string[] }) {
  const cam = CAMERA[p.shot.camera];
  const talk = p.speaking.length
    ? `${p.speaking.map((k) => k.toUpperCase()).join(" and ")} ${p.speaking.length > 1 ? "talk" : "talks"} expressively with clear mouth movements.`
    : "No one talks.";
  const text = [
    `${cam.move}.`,
    sentence(p.shot.visualPromptEn),
    talk,
    "Exaggerated cartoon acting, smooth fluid 3D animation, consistent character design, outfits and colors identical to the first frame, no new characters, no text.",
  ].join(" ");
  return text.length > 950 ? text.slice(0, 947) + "..." : text;
}
