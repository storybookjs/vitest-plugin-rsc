import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

// oxlint-disable-next-line no-process-env
const isCI = Boolean(process.env.CI);
const sourceConditions = isCI ? [] : ["vitest-plugin-rsc-source"];
const vitestPluginRSCImport = isCI
  ? "vitest-plugin-rsc"
  : "../../packages/vitest-plugin-rsc/src/index.ts";
const vitestPluginNextImport = isCI
  ? "vitest-plugin-rsc/nextjs/plugin"
  : "../../packages/vitest-plugin-rsc/src/nextjs/plugin.ts";
const [{ vitestPluginRSC }, { vitestPluginNext }] = await Promise.all([
  import(/* @vite-ignore */ vitestPluginRSCImport),
  import(/* @vite-ignore */ vitestPluginNextImport),
]);

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    conditions: [...sourceConditions, "test"],
  },
  optimizeDeps: {
    include: [
      "next/dist/client/components/http-access-fallback/http-access-fallback.js",
      "next/dist/client/components/redirect-error.js",
      "next/dist/client/components/redirect-status-code.js",
      "next/dist/client/components/redirect.js",
    ],
  },
  test: {
    name: "nextjs-no-msw-demo",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
