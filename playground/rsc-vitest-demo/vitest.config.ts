import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [vitestPluginRSC()],
  resolve: {
    // oxlint-disable-next-line no-process-env
    conditions: process.env.CI ? [] : ["vitest-plugin-rsc-source"],
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
