import type { TestProjectInlineConfiguration, UserWorkspaceConfig } from "vitest/config";
import { defineConfig } from "vitest/config";
import vitestPluginRscProject from "./packages/vitest-plugin-rsc/vitest.config";
import nextjsNoMswDemoProject from "./playground/nextjs-no-msw-demo/vitest.config";
import { nextjsNotesProjects } from "./playground/nextjs-notes-demo/vitest.config";
import rscVitestDemoProject from "./playground/rsc-vitest-demo/vitest.config";

// oxlint-disable-next-line no-process-env
const isCI = Boolean(process.env.CI);
const maxWorkers = isCI ? undefined : 4;
const sourceConditions = isCI ? [] : ["vitest-plugin-rsc-source"];

function withRootDefaults(project: UserWorkspaceConfig): TestProjectInlineConfiguration {
  return {
    extends: true,
    ...project,
  };
}

export default defineConfig({
  resolve: {
    conditions: sourceConditions,
  },
  test: {
    maxWorkers,
    projects: [
      withRootDefaults(vitestPluginRscProject),
      withRootDefaults(rscVitestDemoProject),
      withRootDefaults(nextjsNoMswDemoProject),
      ...nextjsNotesProjects.map(withRootDefaults),
    ],
  },
});
