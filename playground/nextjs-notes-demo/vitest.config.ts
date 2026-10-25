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

// A provider of its own for each project, which starts Chromium with `args`.
const browserMode = (args: string[] = []) => ({
  enabled: true,
  headless: true,
  provider: playwright({ launchOptions: { args } }),
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
      // For components/changing-probe.test.tsx and
      // test/speed-features.test.tsx.
      provide: { mode, build },
      include: speed ? [speedFeaturesTest] : ["**/*.test.{ts,tsx}"],
      // e2e/ runs Storybook: see vitest.storybook.config.ts. A `.node.test`
      // file is the node project's.
      exclude: [
        "e2e/**",
        "node_modules",
        "**/*.node.test.{ts,tsx}",
        ...(speed ? [] : [speedFeaturesTest]),
      ],
      browser: {
        // A collection of the heap and its precise size, which
        // test/page-leaks.test.tsx asks for.
        ...browserMode(["--js-flags=--expose-gc", "--enable-precise-memory-info"]),
        viewport: { width: 390, height: 844 },
        // A page connects once the plugin has compiled Next's server layers
        // for its project, which Vitest starts for every project of a run at
        // once: the nine of the speed features, in one run, take longer than
        // Vitest's 60 s for the last of them.
        ...(speed && { connectTimeout: 240_000 }),
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

// The tests of the app in a Node.js worker, with happy-dom or jsdom for the
// document, where the browser projects run in Chromium, in fidelity mode,
// and with happy-dom in fast mode too, as the benchmark's columns of a DOM of
// Node.js run. The same plugins: without Browser Mode the plugin is the
// page's host itself (SB-2419). Its server runs on Node.js itself, with
// Node's `AsyncLocalStorage`, which components/async-context.node.test.tsx
// probes, with `page` of dom-locators for the one of `vitest/browser`. In a
// pool of its own, whose page gets its modules from Vitest's RPC and sees a
// change of a file at its next page load, or with `cacheDevServer` at the
// next test file: see packages/vitest-plugin-rsc/src/utils.node-host.test.ts.
//
// A `.tcp.node.test` file is the TCP project's: the app's own `lib/db.ts`, on
// node-postgres, without the mock, reaches Postgres over TCP: PGlite, served
// by pglite-socket in the worker (vitest.setup.tcp.ts). The server layers
// have Node's own `net` there.
const nodeProject = (
  name: string,
  environment: "happy-dom" | "jsdom",
  {
    overTcp = false,
    mode = "fidelity",
    cacheDevServer = mode === "fast",
  }: { overTcp?: boolean; mode?: Mode; cacheDevServer?: boolean } = {},
) =>
  defineProject({
    root,
    envPrefix: ["VITE_", "CI"],
    resolve: {
      tsconfigPaths: true,
      conditions: [...vitestPluginRscSourceConditions, "test"],
      alias: [{ find: /^vitest\/browser$/, replacement: "dom-locators" }],
    },
    // PGlite sees Node.js here, and runs as on Node.js, and MSW's server is
    // one of Node.js: Node.js imports them itself, where a pre-bundle would
    // have the server's web APIs. And pglite-socket, which serves PGlite.
    optimizeDeps: {
      include: ["drizzle-orm/pglite"],
      exclude: ["@electric-sql/pglite", "@electric-sql/pglite-socket", "msw"],
    },
    plugins: [
      vitestPluginRSC(),
      // oxlint-disable-next-line no-process-env
      vitestPluginNext({
        build: (process.env.VITEST_PLUGIN_RSC_BUILD || "development") as NextBuild,
        mode,
        // Testing Library, which the tests query the page with, where the
        // browser projects have `vitest/browser`: it asks for `document`.
        browserModules: ["**/node_modules/@testing-library/**"],
        // And dom-locators, `page` of the probes, and jest-dom's matchers:
        // the page's own modules, as `vitest` is.
        host: { packages: ["dom-locators", "@testing-library/jest-dom"] },
        cacheDevServer,
      }),
      // For components/changing-probe.node.test.tsx.
      fileChangeService(),
    ],
    test: {
      name,
      // For components/changing-probe.node.test.tsx, and the mode for
      // test/page-status.test.tsx.
      provide: { mode, cacheDevServer },
      // test/page-leaks.test.tsx and test/page-status.test.tsx run in
      // Chromium and here alike.
      include: [
        overTcp ? "**/*.tcp.node.test.{ts,tsx}" : "**/*.node.test.{ts,tsx}",
        ...(overTcp ? [] : ["test/page-leaks.test.tsx", "test/page-status.test.tsx"]),
      ],
      exclude: ["e2e/**", "node_modules", ...(overTcp ? [] : ["**/*.tcp.node.test.{ts,tsx}"])],
      environment,
      isolate: false,
      // What Vitest gives a test in Browser Mode, where Node.js has 5 s: the
      // first test of a file opens its route, which compiles that route and
      // the first modules of the browser layer, as with Browser Mode. The ssr
      // layer loads in the setup file, and the optimizer's first bundling
      // before the worker starts, out of a test's time.
      testTimeout: 15_000,
      expect: { poll: { timeout: 10_000 } },
      setupFiles: [overTcp ? "./vitest.setup.tcp.ts" : "./vitest.setup.node.ts"],
    },
  });

export const nextjsNotesProjects = [
  nodeProject("nextjs-notes-demo-happy-dom", "happy-dom", { cacheDevServer: true }),
  nodeProject("nextjs-notes-demo-happy-dom-fast", "happy-dom", { mode: "fast" }),
  nodeProject("nextjs-notes-demo-jsdom", "jsdom"),
  nodeProject("nextjs-notes-demo-tcp", "happy-dom", { overTcp: true }),
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
