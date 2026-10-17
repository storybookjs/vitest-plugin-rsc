import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/preset.ts", "src/preview.ts", "src/vite-plugin.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
