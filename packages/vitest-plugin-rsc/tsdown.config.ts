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
    "src/nextjs/affected/browser.ts",
    "src/nextjs/rsc.ts",
    "src/nextjs/ssr.ts",
    "src/nextjs/client.tsx",
    "src/nextjs/client-node.tsx",
    "src/nextjs/internal.ts",
  ],
  format: ["esm"],
  fixedExtension: false,
  deps: {
    neverBundle: [/^virtual:/, /^@vitejs\/plugin-rsc\/vendor\//, /^vitest(\/|$)/],
  },
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
