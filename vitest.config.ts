import { defineConfig, type TestProjectInlineConfiguration } from "vitest/config";
import { parseCLI } from "vitest/node";
import { vitestPluginRscSourceConditions } from "./vitest.conditions.ts";
import { domLocatorsProjects } from "./packages/dom-locators/vitest.config.ts";
import storybookNextjsViteRscProject from "./packages/storybook-nextjs-vite-rsc/vitest.config.ts";
import vitestPluginRscProject from "./packages/vitest-plugin-rsc/vitest.config.ts";
import nextjsCacheComponentsDemoBuildProject from "./playground/nextjs-cache-components-demo/vitest.build.config.ts";
import { nextjsCacheComponentsDemoProjects } from "./playground/nextjs-cache-components-demo/vitest.config.ts";
import nextjsDbRecipesProject from "./playground/nextjs-db-recipes/vitest.config.ts";
import nextjsE2eDemoBuildProject from "./playground/nextjs-e2e-demo/vitest.build.config.ts";
import nextjsE2eDemoProject from "./playground/nextjs-e2e-demo/vitest.config.ts";
import nextjsHostDemoBuildProject from "./playground/nextjs-host-demo/vitest.build.config.ts";
import { nextjsHostDemoProjects } from "./playground/nextjs-host-demo/vitest.config.ts";
import { nextjsNotesProjects } from "./playground/nextjs-notes-demo/vitest.config.ts";
import { nextjsNotesStorybookProjects } from "./playground/nextjs-notes-demo/vitest.storybook.config.ts";
import rscVitestDemoBuildProject from "./playground/rsc-vitest-demo/vitest.build.config.ts";
import rscVitestDemoProject from "./playground/rsc-vitest-demo/vitest.config.ts";

// The projects that start a dev server, `storybook dev`, `storybook build` or
// a static build: minutes, where the others take seconds together.
const slowProject = /^(nextjs-host-demo|nextjs-notes-demo-storybook)|-build$/;

// `pnpm test` runs the fast tier, `pnpm test:slow` the slow one, and
// `pnpm test:all`, `pnpm test:dist` and CI every project. A file or a
// `--project` on the command line selects from every project, so that a run
// of one test file of the slow tier runs it.
// oxlint-disable-next-line no-process-env
const tier = process.env.VITEST_RSC_TIER;
const { filter, options } = parseCLI(["vitest", ...process.argv.slice(2)]);
const byTier = ({ test }: TestProjectInlineConfiguration) => {
  if (tier === undefined || filter.length > 0 || options.project !== undefined) return true;
  const name = typeof test?.name === "string" ? test.name : (test?.name?.label ?? "");
  return slowProject.test(name) === (tier === "slow");
};

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
        "packages/dom-locators/src/**/*.ts",
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
        "playground/nextjs-notes-demo/lib/db.ts",
      ],
    },
    // oxlint-disable-next-line no-process-env
    maxWorkers: process.env.CI ? undefined : 2,
    projects: [
      vitestPluginRscProject,
      storybookNextjsViteRscProject,
      ...domLocatorsProjects,
      rscVitestDemoProject,
      rscVitestDemoBuildProject,
      nextjsE2eDemoProject,
      ...nextjsCacheComponentsDemoProjects,
      nextjsCacheComponentsDemoBuildProject,
      nextjsDbRecipesProject,
      nextjsE2eDemoBuildProject,
      ...nextjsHostDemoProjects,
      nextjsHostDemoBuildProject,
      ...nextjsNotesProjects,
      ...nextjsNotesStorybookProjects,
    ].filter(byTier),
  },
});
