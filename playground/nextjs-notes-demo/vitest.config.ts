import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import "#env/load-next.ts";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

// oxlint-disable-next-line no-process-env
const maxWorkers = process.env.CI ? undefined : 4;

export default defineConfig({
  envPrefix: ["VITE_", "CI"],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "vitest/suite": "@vitest/runner",
    },
    conditions: ["test"],
  },
  optimizeDeps: {
    include: [
      "next/dist/client/components/http-access-fallback/http-access-fallback.js",
      "next/dist/client/components/redirect-error.js",
      "next/dist/client/components/redirect-status-code.js",
      "next/dist/client/components/redirect.js",
      "next/dist/client/components/router-reducer/create-href-from-url.js",
      "next/dist/server/lib/server-action-request-meta.js",
    ],
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
