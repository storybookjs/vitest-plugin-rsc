import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/testing-library.tsx",
    "src/testing-library-client.tsx",
    "src/nextjs/client.tsx",
    "src/nextjs/testing-library.ts",
    "src/nextjs/navigation.ts",
    "src/nextjs/navigation.react-server.ts",
    "src/nextjs/plugin.ts",
    "src/nextjs/headers.ts",
    "src/nextjs/cache.ts",
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
