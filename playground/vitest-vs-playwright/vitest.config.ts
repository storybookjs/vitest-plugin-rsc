import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { server } from "../test-helpers/browser-server.ts";
import { cacheDir } from "../test-helpers/vite-cache.ts";
import { writePgliteFiles } from "./test/pglite-files.ts";

// The files of PGlite in the page: see test/pglite-files.ts.
await writePgliteFiles();

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // On Bun, a dependency cache of its own: see ../test-helpers/vite-cache.ts.
  cacheDir,
  // The browser server on 127.0.0.1, which Bun needs: see
  // ../test-helpers/browser-server.ts.
  server,
  // What lib/__mocks__/db.ts imports, which no file that Vite scans imports.
  optimizeDeps: { include: ["@electric-sql/pglite", "drizzle-orm/pglite"] },
  plugins: [
    vitestPluginRSC(),
    // Next and React in production, as `next start` runs them, unless
    // `VITEST_PLUGIN_RSC_BUILD=development`.
    // oxlint-disable-next-line no-process-env
    vitestPluginNext({ build: (process.env.VITEST_PLUGIN_RSC_BUILD || "production") as NextBuild }),
  ],
  test: {
    name: "vitest-vs-playwright",
    include: ["tests/vitest/*.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
    // As long as Playwright's `expect` waits: see playwright.config.ts.
    expect: { poll: { timeout: 5_000 } },
    setupFiles: ["./vitest.setup.ts"],
  },
});
