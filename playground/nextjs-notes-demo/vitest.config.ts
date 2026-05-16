import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

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
    envPrefix: ["VITE_", "CI"],
    resolve: {
      tsconfigPaths: true,
      alias: {
        "vitest/suite": "@vitest/runner",
      },
      conditions: [...vitestPluginRscSourceConditions, "test"],
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
  };
}

export const nextjsNotesProjects = [
  defineProject({
    ...createSharedProjectConfig(),
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
    projects: nextjsNotesProjects,
  },
});
