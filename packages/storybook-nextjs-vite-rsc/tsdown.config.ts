import { defineConfig } from "tsdown";

export default defineConfig({
  // The entries, and load.ts, the module loader the preset names.
  entry: ["src/index.ts", "src/server.ts", "src/preset.ts", "src/load.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
