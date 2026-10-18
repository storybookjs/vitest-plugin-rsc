import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/preset.ts", "src/preview.ts", "src/client-canvas.tsx"],
  format: ["esm"],
  fixedExtension: false,
  // The virtual module of project.ts, which the Vite config of Storybook has.
  deps: { neverBundle: [/^virtual:/] },
  inputOptions: {
    onLog(level, log, handler) {
      // The canvas is an entry of its own, so the directive stays at its top:
      // dist/client-canvas.js, which the plugin evaluates in the browser layer.
      if (log.code === "MODULE_LEVEL_DIRECTIVE" && log.id?.endsWith("client-canvas.tsx")) return;
      handler(level, log);
    },
  },
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
