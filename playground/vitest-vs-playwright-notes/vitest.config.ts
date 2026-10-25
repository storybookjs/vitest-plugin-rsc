import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import {
  vitestPluginNext,
  type NextBuild,
  type SpeedOptions,
} from "vitest-plugin-rsc/nextjs/plugin";
import { cacheDir } from "../test-helpers/vite-cache.ts";
import { writePgliteFiles } from "./test/pglite-files.ts";

// The files of PGlite in the page: see test/pglite-files.ts.
await writePgliteFiles();

// The benchmark's knob for the price of one speed feature alone:
// `VITEST_PLUGIN_RSC_FEATURES="watchDom,keepApp=false"` sets each named
// feature over `VITEST_PLUGIN_RSC_MODE`, on, or off with `=false`.
const features: SpeedOptions = Object.fromEntries(
  // oxlint-disable-next-line no-process-env
  (process.env.VITEST_PLUGIN_RSC_FEATURES ?? "")
    .split(",")
    .filter(Boolean)
    .map((entry) => {
      const [name, value] = entry.trim().split("=");
      return [name, value !== "false"];
    }),
);

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // On Bun, a dependency cache of its own: see ../test-helpers/vite-cache.ts.
  cacheDir,
  // What lib/__mocks__/db.ts imports, which no file that Vite scans imports.
  optimizeDeps: { include: ["@electric-sql/pglite", "drizzle-orm/pglite"] },
  plugins: [
    vitestPluginRSC(),
    // Next and React in production, as `next start` runs them, unless
    // `VITEST_PLUGIN_RSC_BUILD=development`.
    vitestPluginNext({
      // oxlint-disable-next-line no-process-env
      build: (process.env.VITEST_PLUGIN_RSC_BUILD || "production") as NextBuild,
      // Testing Library's user-event, of tests/vitest-user-event/, the DOM
      // library it drives, and dom-locators, of tests/dom-locators/: the
      // browser's, the page's own modules, as `vitest` is. Any other
      // package is server code in the page.
      host: { packages: ["@testing-library/user-event", "@testing-library/dom", "dom-locators"] },
      ...features,
    }),
  ],
  test: {
    name: "vitest-vs-playwright-notes",
    // Every test with its time, where the default lists only the slow ones.
    reporters: ["tree"],
    // tests/vitest/ acts with Playwright, tests/vitest-user-event/ with Testing
    // Library in the page, tests/dom-locators/ with dom-locators in the page:
    // a run picks one with a filter, as the workflow does.
    include: [
      "tests/vitest/*.test.tsx",
      "tests/vitest-user-event/*.test.tsx",
      "tests/dom-locators/*.test.tsx",
      "tests/zz-*/*.test.tsx",
    ],
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
