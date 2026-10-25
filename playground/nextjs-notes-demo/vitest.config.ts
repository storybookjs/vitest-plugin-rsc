import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import {
  vitestPluginNext,
  type Mode,
  type NextBuild,
  type SpeedOptions,
} from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";
import { fileChangeService } from "../test-helpers/file-change-service.ts";
import { setup as buildStorybookFramework } from "../test-helpers/storybook-framework.ts";
import { writePgliteFiles } from "./test/pglite-files.ts";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

// Google Fonts, without the network: see the file.
// oxlint-disable-next-line no-process-env
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../vitest.google-fonts.cjs", import.meta.url),
);

// The database of a test: see test/pglite-files.ts.
await writePgliteFiles();

const root = fileURLToPath(new URL("./", import.meta.url));
const nextNotesRequire = createRequire(new URL("./package.json", import.meta.url));

const { loadEnvConfig } = nextNotesRequire("@next/env") as {
  loadEnvConfig(projectDir: string, dev?: boolean): void;
};
// oxlint-disable-next-line no-process-env
const nextNotesDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
loadEnvConfig(root, nextNotesDev);

// Storybook's Vitest addon reads the presets of .storybook/main.ts as the
// config loads, the framework's by its build: see the file.
buildStorybookFramework();
// oxlint-disable-next-line no-process-env
process.env.STORYBOOK_DISABLE_TELEMETRY ??= "1";

// Next's production code with `VITEST_PLUGIN_RSC_BUILD=production`, which CI
// runs the suite with too.
// oxlint-disable-next-line no-process-env
const build = (process.env.VITEST_PLUGIN_RSC_BUILD || "development") as NextBuild;

// A provider of its own for each project.
const browserMode = () => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  instances: [{ browser: "chromium" as const }],
});

// The tests of what each speed feature gives up, in projects of their own: a
// change of a module by another test file of the same dev server, like
// components/changing-probe.test.tsx does, starts their kept app anew.
const speedFeaturesTest = "test/speed-features.test.tsx";

// The tests of the app, which open its routes: in fidelity mode, as CI runs
// them, and in fast mode (`mode` of `vitestPluginNext()`), which they pass in
// too. With `speed`, which turns speed features on or off over the mode, the
// tests of the speed features alone.
const browserProject = (name: string, mode: Mode, speed?: SpeedOptions) =>
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
    // What lib/__mocks__/db.ts imports, which no file that Vite scans for
    // dependencies imports: found while the tests run, they would make Vite
    // optimize again, and reload the tests.
    optimizeDeps: { include: ["@electric-sql/pglite", "drizzle-orm/pglite"] },
    plugins: [
      vitestPluginRSC(),
      vitestPluginNext({ build, mode, ...speed }),
      // For components/changing-probe.test.tsx and test/speed-features.test.tsx.
      fileChangeService(),
    ],
    test: {
      name,
      // For components/changing-probe.test.tsx and test/speed-features.test.tsx.
      provide: { mode, build },
      include: speed ? [speedFeaturesTest] : ["**/*.test.{ts,tsx}"],
      // e2e/ runs Storybook: see vitest.storybook.config.ts.
      exclude: ["e2e/**", "node_modules", ...(speed ? [] : [speedFeaturesTest])],
      browser: { ...browserMode(), viewport: { width: 390, height: 844 } },
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
  });

// Every speed feature of fast mode.
const speedFeatures: (keyof SpeedOptions)[] = [
  "watchDom",
  "cacheDevServer",
  "keepApp",
  "flightLoads",
  "skipPrefetch",
  "fastCrypto",
  "immediates",
];

export const nextjsNotesProjects = [
  browserProject("nextjs-notes-demo-browser", "fidelity"),
  browserProject("nextjs-notes-demo-fast", "fast"),
  // What each speed feature gives up: with none, with all, and in fast mode
  // without one of them.
  browserProject("nextjs-notes-demo-speed-fidelity", "fidelity", {}),
  browserProject("nextjs-notes-demo-speed-fast", "fast", {}),
  ...speedFeatures.map((feature) =>
    browserProject(`nextjs-notes-demo-speed-fast-without-${feature}`, "fast", {
      [feature]: false,
    }),
  ),
  // Every story of the app, as a test of Storybook's Vitest addon, which
  // makes a story file a test file: a server story renders in a page of the
  // app, a client story in the browser layer, each with the preview its file
  // imports. The framework brings the plugin, from .storybook/main.ts, and
  // the preview mocks the database, as in Storybook. This project is also
  // what the addon runs from Storybook's own UI.
  defineProject({
    root,
    resolve: { conditions: vitestPluginRscSourceConditions },
    optimizeDeps: { include: ["@electric-sql/pglite", "drizzle-orm/pglite"] },
    plugins: [storybookTest({ configDir: fileURLToPath(new URL(".storybook", import.meta.url)) })],
    test: {
      name: "nextjs-notes-demo-stories",
      browser: browserMode(),
      isolate: false,
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
