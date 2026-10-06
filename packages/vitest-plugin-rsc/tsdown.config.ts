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
    "src/next/index.ts",
    "src/next/plugin.ts",
    "src/next/setup.ts",
    "src/next/rsc.ts",
    "src/next/ssr.ts",
    "src/next/client.tsx",
    "src/next/app-page-entrypoint.ts",
  ],
  format: ["esm"],
  fixedExtension: false,
  deps: {
    neverBundle: [
      /^virtual:/,
      /^@vitejs\/plugin-rsc\/vendor\//,
      "vitest-plugin-rsc/nextjs/client",
      "vitest",
    ],
  },
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
