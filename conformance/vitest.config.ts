import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { searchForWorkspaceRoot } from "vite";
import { defineConfig } from "vitest/config";
import { vitestPluginRscSourceConditions } from "../vitest.conditions.ts";
import { ConformanceReporter } from "./src/reporter.ts";
import {
  conformance,
  fileExistsCommand,
  readFileCommand,
  serverNetworkCommand,
} from "./src/vite-plugin.ts";

// The Vitest project of one fixture of Next's own e2e tests. `src/run.ts`
// starts a run of it per fixture, and says which through the environment.
const here = fileURLToPath(new URL("./", import.meta.url));
const env = (name: string): string => {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is not set. Run the fixtures with \`pnpm conformance\`, see docs/next-conformance.md.`,
    );
  return value;
};

const root = env("NEXT_CONFORMANCE_ROOT");
const tests = JSON.parse(env("NEXT_CONFORMANCE_TESTS")) as string[];
const nextTestLib = env("NEXT_CONFORMANCE_TEST_LIB");
const cacheDir = env("NEXT_CONFORMANCE_CACHE");
const resultFile = env("NEXT_CONFORMANCE_RESULT");
const assumeInstalled = JSON.parse(
  process.env.NEXT_CONFORMANCE_ASSUME_INSTALLED || "[]",
) as string[];
const prepared = JSON.parse(process.env.NEXT_CONFORMANCE_PREPARED || "[]") as string[];
const mode = process.env.NEXT_CONFORMANCE_MODE === "dev" ? "dev" : "start";
const testTimeout = Number(process.env.NEXT_CONFORMANCE_TEST_TIMEOUT || 60) * 1000;
// Another checkout of this repository, to measure its plugin with this runner.
const pluginCheckout = process.env.NEXT_CONFORMANCE_PLUGIN || undefined;

const requirePlugin = createRequire(path.join(pluginCheckout ?? here, "package.json"));
const load = (entry: string) => import(pathToFileURL(requirePlugin.resolve(entry)).href);
const { vitestPluginRSC } = (await load("vitest-plugin-rsc")) as typeof import("vitest-plugin-rsc");
const { vitestPluginNext } = (await load(
  "vitest-plugin-rsc/nextjs/plugin",
)) as typeof import("vitest-plugin-rsc/nextjs/plugin");

// Google Fonts, without the network: see the file.
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = path.join(here, "../vitest.google-fonts.cjs");

export default defineConfig({
  root,
  // Not in the app, which the runner copies anew for every run, and one for
  // each fixture: the dependencies of an app are part of what Vite keeps.
  cacheDir,
  plugins: [
    conformance({ root, mode, nextTestLib, pluginCheckout, assumeInstalled, prepared }),
    vitestPluginRSC(),
    // The shim works on the page, so it has to see the browser.
    vitestPluginNext({
      browserModules: [path.join(here, "shim/**"), path.join(nextTestLib, "**")],
    }),
  ],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
  // The dev server serves the files of this repository. The plugin of
  // another checkout is outside of it.
  server: {
    fs: { allow: [searchForWorkspaceRoot(here), ...(pluginCheckout ? [pluginCheckout] : [])] },
  },
  // What the tests and the shim import. The plugin has Vite scan the app, and
  // a dependency that Vite finds mid-run reloads the tab.
  optimizeDeps: {
    include: ["cheerio", "jest-extended", "outdent", "pathe", "strip-ansi"],
  },
  test: {
    name: path.basename(root),
    include: tests,
    exclude: ["**/node_modules/**"],
    // Jest's, which the tests of Next are written for.
    globals: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      commands: {
        conformanceReadFile: readFileCommand(root),
        conformanceFileExists: fileExistsCommand(root),
        conformanceServerNetwork: serverNetworkCommand(),
      },
      screenshotFailures: false,
    },
    isolate: false,
    fileParallelism: false,
    setupFiles: [path.join(here, "shim/setup.ts")],
    // Next gives a test of an app that `next start` serves a minute.
    testTimeout,
    hookTimeout: testTimeout,
    // A test of Next expects what is there. It never writes a snapshot.
    update: "none",
    // Every test as it ends, for the log of the fixture.
    reporters: ["verbose", new ConformanceReporter(resultFile)],
    // The app logs to the tab's console, and so does the server in it. Not
    // in the log of the fixture, unless the runner asks: `--print`.
    onConsoleLog: () => Boolean(process.env.NEXT_CONFORMANCE_PRINT),
    // An error of the page is the page's, as it is for Playwright. A test
    // fails on what it asserts.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
