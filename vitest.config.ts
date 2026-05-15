import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

// oxlint-disable-next-line no-process-env
const maxWorkers = process.env.CI ? undefined : 4;

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const nextNotesRoot = root("./playground/nextjs-notes-demo/");
const nextNotesRequire = createRequire(
  new URL("./playground/nextjs-notes-demo/package.json", import.meta.url),
);

const { loadEnvConfig } = nextNotesRequire("@next/env") as {
  loadEnvConfig(projectDir: string, dev?: boolean): void;
};
const nextNotesDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
loadEnvConfig(nextNotesRoot, nextNotesDev);

const nextOptimizeDeps = [
  "next/dist/client/components/http-access-fallback/http-access-fallback.js",
  "next/dist/client/components/redirect-error.js",
  "next/dist/client/components/redirect-status-code.js",
  "next/dist/client/components/redirect.js",
];

const nextNotesOptimizeDeps = [
  ...nextOptimizeDeps,
  "next/dist/client/components/router-reducer/create-href-from-url.js",
  "next/dist/server/lib/server-action-request-meta.js",
];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "packages/vitest-plugin-rsc/src/**/*.{ts,tsx}",
        "playground/rsc-vitest-demo/src/**/*.{ts,tsx}",
        "playground/nextjs-no-msw-demo/**/*.{ts,tsx}",
        "playground/nextjs-notes-demo/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/.next/**/*",
        "**/node_modules/**/*",
        "**/*.{test,test-fixture,mock,config}.{ts,tsx}",
        "**/*.d.ts",
        "**/vitest*.{ts,tsx}",
        "playground/nextjs-notes-demo/{db,env,scripts,test}/**/*.{ts,tsx}",
        "playground/nextjs-notes-demo/lib/db{,.dev}.ts",
      ],
    },
    projects: [
      {
        root: root("./packages/vitest-plugin-rsc/"),
        test: {
          name: "vitest-plugin-rsc",
          include: ["src/**/*.test.ts"],
          environment: "node",
          maxWorkers,
        },
      },
      {
        root: root("./playground/rsc-vitest-demo/"),
        plugins: [vitestPluginRSC()],
        test: {
          name: "rsc-vitest-demo",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          maxWorkers,
          restoreMocks: true,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            screenshotFailures: false,
            instances: [{ browser: "chromium" }],
          },
          setupFiles: ["./src/vitest.setup.ts"],
        },
      },
      {
        root: root("./playground/nextjs-no-msw-demo/"),
        plugins: [vitestPluginRSC(), vitestPluginNext()],
        resolve: {
          conditions: ["test"],
        },
        optimizeDeps: {
          include: nextOptimizeDeps,
        },
        test: {
          name: "nextjs-no-msw-demo",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["node_modules"],
          maxWorkers,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          isolate: false,
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        root: nextNotesRoot,
        envPrefix: ["VITE_", "CI"],
        plugins: [vitestPluginRSC(), vitestPluginNext()],
        resolve: {
          tsconfigPaths: true,
          alias: {
            "vitest/suite": "@vitest/runner",
          },
          conditions: ["test"],
        },
        optimizeDeps: {
          include: nextNotesOptimizeDeps,
        },
        test: {
          name: "nextjs-notes-demo-browser",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["**/*.node.test.{ts,tsx}", "node_modules"],
          maxWorkers,
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
      },
      {
        root: nextNotesRoot,
        envPrefix: ["VITE_", "CI"],
        resolve: {
          tsconfigPaths: true,
          alias: {
            "vitest/suite": "@vitest/runner",
          },
          conditions: ["test"],
        },
        optimizeDeps: {
          include: nextNotesOptimizeDeps,
        },
        test: {
          name: "nextjs-notes-demo-node",
          include: ["**/*.node.test.ts"],
          exclude: ["node_modules"],
          environment: "node",
          maxWorkers,
          setupFiles: ["./vitest.setup.node.ts"],
        },
      },
    ],
  },
});
