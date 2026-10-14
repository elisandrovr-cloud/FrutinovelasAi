import { defineConfig } from "tsup";

/**
 * Build de la función de Vercel: un único archivo ESM (.mjs, sin ambigüedad de
 * tipo de módulo) en dist/index.mjs, que Vercel detecta como entrypoint del
 * servicio "api". Las dependencias de npm quedan externas (Vercel las traza);
 * @fruti/shared (TypeScript fuente) se empaqueta dentro.
 */
export default defineConfig({
  entry: { index: "src/vercel.ts" },
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  noExternal: ["@fruti/shared"],
});
