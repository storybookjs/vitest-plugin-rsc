import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import "#env/load-next.ts";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

// oxlint-disable-next-line no-process-env
const maxWorkers = process.env.CI ? 1 : 4;

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
    maxWorkers,
    projects: [
      {
        extends: true,
        plugins: [vitestPluginRSC(), vitestPluginNext()],
        test: {
          name: "nextjs-notes-demo-browser",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["**/*.node.test.{ts,tsx}", "node_modules"],
          browser: {
            traceView: true,
            enabled: true,
            headless: true,
            viewport: { width: 390, height: 844 },
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          // Browser workers each own their browser state and run in parallel
          // locally. Whole-document Next route hydration is heavier on CI, so
          // the top-level maxWorkers setting serializes browser files there.
          // Inside one worker, cleanup belongs in beforeEach.
          isolate: false,
          globalSetup: ["./vitest.global-setup.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "nextjs-notes-demo-node",
          include: ["**/*.node.test.ts"],
          exclude: ["node_modules"],
          environment: "node",
          setupFiles: ["./vitest.setup.node.ts"],
        },
      },
    ],
  },
});
