import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/async-hooks.ts",
    "src/testing-library.tsx",
    "src/testing-library-client.tsx",
    "src/nextjs/index.ts",
    "src/nextjs/plugin.ts",
    "src/nextjs/adapter.ts",
    "src/nextjs/setup.ts",
    "src/nextjs/rsc.ts",
    "src/nextjs/ssr.ts",
    "src/nextjs/client.tsx",
    // Its own file: Vite RSC compiles the module of a "use server" directive.
    "src/nextjs/server-action.ts",
  ],
  // The page the tests run in, next to the plugin that names it.
  copy: [{ from: "src/nextjs/tester.html", to: "dist/nextjs" }],
  format: ["esm"],
  fixedExtension: false,
  deps: {
    neverBundle: [/^virtual:/, /^@vitejs\/plugin-rsc\/vendor\//, /^vitest(\/|$)/],
  },
  inputOptions: {
    onLog(level, log, handler) {
      // The file of a "use server" directive is an entry of its own, so the
      // directive stays at its top: dist/nextjs/server-action.js.
      if (log.code === "MODULE_LEVEL_DIRECTIVE" && log.id?.endsWith("server-action.ts")) return;
      handler(level, log);
    },
  },
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
