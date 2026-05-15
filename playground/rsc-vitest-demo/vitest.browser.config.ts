import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";

// oxlint-disable-next-line no-process-env
const maxWorkers = process.env.CI ? undefined : 4;

export default defineProject({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vitestPluginRSC()],
  test: {
    name: "rsc-vitest-demo",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    maxWorkers,
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
