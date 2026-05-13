import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/async-local-storage.ts",
    "src/async-hooks.ts",
    "src/testing-library.tsx",
    "src/testing-library-client.tsx",
    "src/nextjs/client.tsx",
    "src/nextjs/testing-library-client.ts",
    "src/nextjs/testing-library.tsx",
    "src/nextjs/msw.ts",
    "src/nextjs/os-browser.ts",
    "src/nextjs/request-context.ts",
    "src/nextjs/plugin.ts",
  ],
  format: ["esm"],
  fixedExtension: false,
  deps: {
    neverBundle: [/^virtual:/, /^@vitejs\/plugin-rsc\/vendor\//, "vitest-plugin-rsc/nextjs/client"],
  },
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
