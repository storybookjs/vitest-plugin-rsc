import { defineConfig } from "vitest/config";
import vitestPluginRscProject from "./packages/vitest-plugin-rsc/vitest.config.ts";
import nextjsNoMswDemoProject from "./playground/nextjs-no-msw-demo/vitest.config.ts";
import { nextjsNotesProjects } from "./playground/nextjs-notes-demo/vitest.config.ts";
import rscVitestDemoProject from "./playground/rsc-vitest-demo/vitest.config.ts";

export default defineConfig({
  resolve: {
    // oxlint-disable-next-line no-process-env
    conditions: process.env.CI ? [] : ["vitest-plugin-rsc-source"],
  },
  test: {
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
