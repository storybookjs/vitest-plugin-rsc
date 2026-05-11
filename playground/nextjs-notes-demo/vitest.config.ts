import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import "#env/load-next.ts";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

export default defineConfig({
  envPrefix: ["VITE_", "CI"],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "vitest/suite": "@vitest/runner",
    },
    conditions: ["test"],
  },
  test: {
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["**/*.{ts,tsx}"],
      exclude: [
        ".next/**/*",
        "**/*.{test,test-fixture,mock,config}.{ts,tsx}",
        "**/*.d.ts",
        "{db,env,scripts,test}/**/*.{ts,tsx}",
        "lib/db{,.dev}.ts",
        "vitest.*.{ts,tsx}",
      ],
    },
    projects: [
      {
        extends: true,
        plugins: [vitestPluginRSC(), vitestPluginNext()],
        test: {
          name: "browser",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["**/*.node.test.{ts,tsx}", "node_modules"],
          browser: {
            enabled: true,
            headless: true,
            testerHtmlPath: "./vitest.tester.html",
            viewport: { width: 390, height: 844 },
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          // Browser workers each own their browser state and run in parallel.
          // They don't affect each other, browser iframes don't share state!
          // Inside one worker, test files run sequentially with `isolate: false`.
          // Don't remove isolate: false, the problem is not that things happen in parralel.
          // The problem is that you forget to cleanup hanging state in beforeEach 
          // Do not disable file parallelism and do not switch this to isolate: true for hanging state.
          isolate: false,
          globalSetup: ["./vitest.global-setup.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          include: ["**/*.node.test.ts"],
          exclude: ["node_modules"],
          environment: "node",
          setupFiles: ["./vitest.setup.node.ts"],
        },
      },
    ],
  },
});
