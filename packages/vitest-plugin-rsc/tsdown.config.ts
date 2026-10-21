import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/async-hooks.ts",
    "src/testing-library.tsx",
    "src/testing-library-client.tsx",
    "src/nextjs/index.ts",
    "src/nextjs/client-components.ts",
    "src/nextjs/plugin.ts",
    "src/nextjs/adapter.ts",
    "src/nextjs/setup.ts",
    "src/nextjs/affected/browser.ts",
    "src/nextjs/rsc.ts",
    "src/nextjs/ssr.ts",
    "src/nextjs/client.tsx",
    "src/nextjs/internal.ts",
    // A thread of its own: see src/nextjs/project/env.ts.
    "src/nextjs/project/env-worker.ts",
    // Files of their own: Vite RSC compiles the module of a "use server" or
    // a "use client" directive.
    "src/nextjs/server-action.ts",
    "src/nextjs/node-rendered.tsx",
    // The modules of Node.js for the server layers, `vitest-plugin-rsc/node/*`.
    "src/node/**/*.ts",
  ],
  // The page the tests run in, next to the plugin that names it.
  copy: [{ from: "src/nextjs/tester.html", to: "dist/nextjs" }],
  format: ["esm"],
  fixedExtension: false,
  deps: {
    neverBundle: [
      /^virtual:/,
      /^@vitejs\/plugin-rsc\/vendor\//,
      /^vitest(\/|$)/,
      // Left as this import in dist: it resolves to the entry of its own,
      // dist/nextjs/node-rendered.js, with its "use client". See rsc.ts.
      "vitest-plugin-rsc/nextjs/node-rendered",
    ],
  },
  inputOptions: {
    onLog(level, log, handler) {
      // The file of a directive is an entry of its own, so the directive
      // stays at its top: dist/nextjs/server-action.js and node-rendered.js.
      if (
        log.code === "MODULE_LEVEL_DIRECTIVE" &&
        /(server-action|node-rendered)\.tsx?$/.test(log.id ?? "")
      ) {
        return;
      }
      handler(level, log);
    },
  },
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
