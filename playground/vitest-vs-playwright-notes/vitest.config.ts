import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { cacheDir } from "../test-helpers/vite-cache.ts";
import { writePgliteFiles } from "./test/pglite-files.ts";

// The files of PGlite in the page: see test/pglite-files.ts.
await writePgliteFiles();

// The DOM of a run in a worker of Node.js, without a browser:
// `VITEST_DOM=happy-dom` or `VITEST_DOM=jsdom`. For tests/dom-locators/
// only, which acts in the page itself, where the other columns act through
// the browser. Without it, Chromium in Vitest's Browser Mode.
// oxlint-disable-next-line no-process-env
const dom = (process.env.VITEST_DOM || undefined) as "happy-dom" | "jsdom" | undefined;
if (dom !== undefined && dom !== "happy-dom" && dom !== "jsdom") {
  throw new Error(`VITEST_DOM is happy-dom or jsdom, not ${String(dom)}`);
}

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // On Bun, a dependency cache of its own: see ../test-helpers/vite-cache.ts.
  cacheDir,
  // What lib/__mocks__/db.ts imports, which no file that Vite scans imports.
  // In Node.js, PGlite runs as on Node.js, which imports it itself: a
  // pre-bundle would have the stand-ins of a browser for Node's modules.
  optimizeDeps: dom
    ? { include: ["drizzle-orm/pglite"], exclude: ["@electric-sql/pglite"] }
    : { include: ["@electric-sql/pglite", "drizzle-orm/pglite"] },
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
      host: {
        packages: [
          "@testing-library/user-event",
          "@testing-library/dom",
          "dom-locators",
          "@testing-library/jest-dom",
        ],
      },
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
      enabled: !dom,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    // In Node.js, the plugin is the page's host itself: see
    // docs/internals/architecture.md of the plugin.
    environment: dom,
    // Browser Mode's timeout of a test, where Node.js has 5 s: a locator
    // waits until just before it.
    testTimeout: 15_000,
    isolate: false,
    // As long as Playwright's `expect` waits: see playwright.config.ts.
    expect: { poll: { timeout: 5_000 } },
    setupFiles: ["./vitest.setup.ts", ...(dom ? ["./vitest.setup.node.ts"] : [])],
  },
});
