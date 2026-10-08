import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";
import { ignoreWatchedOnlyModules } from "./test/ignore-watched-only-modules.ts";

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

function createSharedProjectConfig() {
  return {
    root,
    // MSW's worker lives in the repo-root public/ (package.json#msw). Vitest 5
    // serves browser tests from the project's own Vite server and publicDir.
    publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
    envPrefix: ["VITE_", "CI"],
    resolve: {
      tsconfigPaths: true,
      conditions: [...vitestPluginRscSourceConditions, "test"],
    },
  };
}

export const nextjsNotesProjects = [
  defineProject({
    ...createSharedProjectConfig(),
    plugins: [
      vitestPluginRSC(),
      vitestPluginNext({ affectedTests: true }),
      ignoreWatchedOnlyModules(),
    ],
    test: {
      name: "nextjs-notes-demo-browser",
      include: ["**/*.test.{ts,tsx}"],
      exclude: ["**/*.node.test.{ts,tsx}", "node_modules"],
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
      globalSetup: ["./vitest.global-setup.ts"],
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
  defineProject({
    ...createSharedProjectConfig(),
    test: {
      name: "nextjs-notes-demo-node",
      include: ["**/*.node.test.ts"],
      exclude: ["node_modules"],
      environment: "node",
      setupFiles: ["./vitest.setup.node.ts"],
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
