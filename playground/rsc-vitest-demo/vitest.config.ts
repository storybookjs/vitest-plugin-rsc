import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";
import { cacheDir } from "../test-helpers/vite-cache.ts";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // On Bun, a dependency cache of its own: see ../test-helpers/vite-cache.ts.
  cacheDir,
  plugins: [vitestPluginRSC()],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
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
    setupFiles: ["./src/test/websockets.ts", "./src/vitest.setup.ts"],
  },
});
