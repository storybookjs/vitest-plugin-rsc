import { defineConfig } from "tsdown";

const sourcemap = process.argv.slice(2).includes("--sourcemap");

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/async-local-storage.ts",
    "src/async-hooks.ts",
    "src/testing-library.tsx",
    "src/testing-library-client.tsx",
    "src/testing-library-ssr.tsx",
    "src/nextjs/browser-polyfills.ts",
    "src/nextjs/edge-web-crypto.ts",
    "src/nextjs/edge-web-crypto-install.ts",
    "src/nextjs/testing-library-client.ts",
    "src/nextjs/testing-library.tsx",
    "src/nextjs/msw.ts",
    "src/nextjs/os-browser.ts",
    "src/nextjs/util-edge.ts",
    "src/nextjs/plugin.ts",
  ],
  format: ["esm"],
  fixedExtension: false,
  deps: {
    neverBundle: [/^virtual:/, /^@vitejs\/plugin-rsc\/vendor\//],
  },
  copy: [{ from: "src/nextjs/tester.html", to: "dist/nextjs" }],
  dts: {
    sourcemap,
  },
});
