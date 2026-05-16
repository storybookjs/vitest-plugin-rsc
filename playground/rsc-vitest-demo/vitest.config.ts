import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// oxlint-disable-next-line no-process-env
const isCI = Boolean(process.env.CI);
const sourceConditions = isCI ? [] : ["vitest-plugin-rsc-source"];
const vitestPluginRSCImport = isCI
  ? "vitest-plugin-rsc"
  : "../../packages/vitest-plugin-rsc/src/index.ts";
const { vitestPluginRSC } = await import(/* @vite-ignore */ vitestPluginRSCImport);

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [vitestPluginRSC()],
  resolve: {
    conditions: sourceConditions,
  },
  test: {
    name: "rsc-vitest-demo",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
