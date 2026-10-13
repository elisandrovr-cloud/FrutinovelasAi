import { createHash } from "node:crypto";

/** Semilla determinista derivada de la semilla maestra de la novela. */
export function deriveSeed(master: number, ...parts: (string | number)[]) {
  const h = createHash("sha256").update([master, ...parts].join(":")).digest();
  return h.readUInt32BE(0) % 2_147_483_647;
}

export function randomSeed() {
  return Math.floor(Math.random() * 2_147_483_647);
}
