import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";
import { cacheDir } from "../test-helpers/vite-cache.ts";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // On Bun, a dependency cache of its own: see ../test-helpers/vite-cache.ts.
  cacheDir,
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
  test: {
    name: "nextjs-cache-components-demo",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "build-test/**", "dist/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
  },
});
