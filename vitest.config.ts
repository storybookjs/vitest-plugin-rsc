import { defineConfig } from "vitest/config";
import { vitestPluginRscSourceConditions } from "./vitest.conditions.ts";
import storybookNextjsViteRscProject from "./packages/storybook-nextjs-vite-rsc/vitest.config.ts";
import vitestPluginRscProject from "./packages/vitest-plugin-rsc/vitest.config.ts";
import nextjsE2eDemoBuildProject from "./playground/nextjs-e2e-demo/vitest.build.config.ts";
import nextjsE2eDemoProject from "./playground/nextjs-e2e-demo/vitest.config.ts";
import nextjsHostDemoBuildProject from "./playground/nextjs-host-demo/vitest.build.config.ts";
import nextjsHostDemoProject from "./playground/nextjs-host-demo/vitest.config.ts";
import { nextjsNotesProjects } from "./playground/nextjs-notes-demo/vitest.config.ts";
import { nextjsNotesStorybookProjects } from "./playground/nextjs-notes-demo/vitest.storybook.config.ts";
import rscVitestDemoBuildProject from "./playground/rsc-vitest-demo/vitest.build.config.ts";
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
        "packages/storybook-nextjs-vite-rsc/src/**/*.{ts,tsx}",
        "playground/rsc-vitest-demo/src/**/*.{ts,tsx}",
        "playground/nextjs-e2e-demo/**/*.{ts,tsx}",
        "playground/nextjs-notes-demo/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/.next/**/*",
        "**/node_modules/**/*",
        "**/*.{test,test-fixture,mock,config}.{ts,tsx}",
        "**/*.d.ts",
        "**/vitest*.{ts,tsx}",
        "playground/nextjs-notes-demo/{.storybook,db,e2e,env,scripts,test}/**/*.{ts,tsx}",
        "playground/nextjs-notes-demo/**/*.stories.tsx",
        "playground/nextjs-notes-demo/lib/db{,.dev}.ts",
      ],
    },
    // oxlint-disable-next-line no-process-env
    maxWorkers: process.env.CI ? undefined : 2,
    projects: [
      vitestPluginRscProject,
      storybookNextjsViteRscProject,
      rscVitestDemoProject,
      rscVitestDemoBuildProject,
      nextjsE2eDemoProject,
      nextjsE2eDemoBuildProject,
      nextjsHostDemoProject,
      nextjsHostDemoBuildProject,
      ...nextjsNotesProjects,
      ...nextjsNotesStorybookProjects,
    ],
  },
});
