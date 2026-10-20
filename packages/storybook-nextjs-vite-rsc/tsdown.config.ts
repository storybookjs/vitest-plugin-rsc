import { defineConfig } from "tsdown";

export default defineConfig({
  // The entries, load.ts, the module loader the preset names, and
  // client-renderer.ts, a package of the host in both layers.
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/preset.ts",
    "src/load.ts",
    "src/client-renderer.ts",
  ],
  format: ["esm"],
  // The package's own module, which index.ts imports by its name.
  external: ["@storybook/nextjs-vite-rsc/client-renderer"],
  fixedExtension: false,
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
