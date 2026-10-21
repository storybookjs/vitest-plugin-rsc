import { defineConfig } from "tsdown";

export default defineConfig({
  // The entries, and the files the preset names: load.ts, the module loader,
  // and preview.ts, a preview annotation.
  entry: ["src/index.ts", "src/server.ts", "src/preset.ts", "src/load.ts", "src/preview.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
