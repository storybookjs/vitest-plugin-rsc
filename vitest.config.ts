import { defineConfig } from "vitest/config";
import { vitestPluginRscSourceConditions } from "./vitest.conditions.ts";
import vitestPluginRscProject from "./packages/vitest-plugin-rsc/vitest.config.ts";
import nextjsNoMswDemoProject from "./playground/nextjs-no-msw-demo/vitest.config.ts";
import { nextjsNotesProjects } from "./playground/nextjs-notes-demo/vitest.config.ts";
import rscVitestDemoProject from "./playground/rsc-vitest-demo/vitest.config.ts";

export default defineConfig({
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
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
    // oxlint-disable-next-line no-process-env
    maxWorkers: process.env.CI ? undefined : 2,
    projects: [
      vitestPluginRscProject,
      rscVitestDemoProject,
      nextjsNoMswDemoProject,
      ...nextjsNotesProjects,
    ],
  },
});
