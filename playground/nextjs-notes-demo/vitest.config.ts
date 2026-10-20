import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";
import { ignoreWatchedOnlyModules } from "./test/ignore-watched-only-modules.ts";
import { schemaSQL } from "./test/schema-sql.ts";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

// Google Fonts, without the network: see the file.
// oxlint-disable-next-line no-process-env
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../vitest.google-fonts.cjs", import.meta.url),
);

const root = fileURLToPath(new URL("./", import.meta.url));
const nextNotesRequire = createRequire(new URL("./package.json", import.meta.url));

const { loadEnvConfig } = nextNotesRequire("@next/env") as {
  loadEnvConfig(projectDir: string, dev?: boolean): void;
};
// oxlint-disable-next-line no-process-env
const nextNotesDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
loadEnvConfig(root, nextNotesDev);

export const nextjsNotesProjects = [
  defineProject({
    root,
    // MSW's worker lives in the repo-root public/ (package.json#msw). Vitest 5
    // serves browser tests from the project's own Vite server and publicDir.
    publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
    envPrefix: ["VITE_", "CI"],
    resolve: {
      tsconfigPaths: true,
      conditions: [...vitestPluginRscSourceConditions, "test"],
    },
    // The schema of the database of a test: see lib/__mocks__/db.ts.
    define: { __SCHEMA_SQL__: JSON.stringify(schemaSQL) },
    // What lib/__mocks__/db.ts imports, which no file that Vite scans for
    // dependencies imports: found while the tests run, they would make Vite
    // optimize again, and reload the tests.
    optimizeDeps: { include: ["@electric-sql/pglite", "drizzle-orm/pglite"] },
    plugins: [
      vitestPluginRSC(),
      // Next's production code with `VITEST_PLUGIN_RSC_BUILD=production`,
      // which CI runs the suite with too.
      // oxlint-disable-next-line no-process-env
      vitestPluginNext({
        affectedTests: true,
        build: (process.env.VITEST_PLUGIN_RSC_BUILD || "development") as NextBuild,
      }),
      ignoreWatchedOnlyModules(),
    ],
    test: {
      name: "nextjs-notes-demo-browser",
      include: ["**/*.test.{ts,tsx}"],
      // e2e/ runs Storybook: see vitest.storybook.config.ts.
      exclude: ["e2e/**", "node_modules"],
      browser: {
        enabled: true,
        headless: true,
        viewport: { width: 390, height: 844 },
        provider: playwright(),
        instances: [{ browser: "chromium" }],
      },
      // Browser workers each own their browser state and run in parallel.
      // Inside one worker, test files run sequentially with `isolate: false`,
      // so cleanup belongs in beforeEach. Do not disable file parallelism
      // and do not switch this to isolate: true for hanging state.
      isolate: false,
      // How long `expect.poll()` waits for what a click or a Server Action
      // does: a request to the app, its render and a write to the database,
      // which takes longer than Vitest's default of 1 s on a slow machine, as
      // on CI. The stories wait as long: see .storybook/round-trip.ts.
      // `expect.element()` waits until the test's own timeout.
      expect: { poll: { timeout: 10_000 } },
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
];

export default defineConfig({
  test: {
    // Every worker loads Next's runtime for three layers before its first test.
    // With a worker per core those loads take longer than a test may: the first
    // test of a file times out. The root config has a limit of its own.
    maxWorkers: 4,
    projects: nextjsNotesProjects,
  },
});
