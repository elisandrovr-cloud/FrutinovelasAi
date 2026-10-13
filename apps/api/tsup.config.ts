import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/worker.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  // @fruti/shared se distribuye como TypeScript fuente: se empaqueta dentro del bundle
  noExternal: ["@fruti/shared"],
});
