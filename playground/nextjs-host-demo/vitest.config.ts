import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, defineProject } from "vitest/config";

// The tests start the dev server of vite.config.ts, as a host without Vitest
// does, and drive it with Playwright: see test/host.test.ts.
const root = fileURLToPath(new URL("./", import.meta.url));
const globalSetup = ["../test-helpers/storybook-framework.ts"];
// What a test waits for comes after a request that can compile or load:
// a story's first render, a Server Action, a reload, a change of a file.
// On CI that takes longer than `expect.poll`'s 1 s. A state that lasts a
// moment, like Storybook's preparing block, has a poll with its own short
// timeout; that something did not happen is no poll.
const expect = { poll: { timeout: 30_000 } };

export const nextjsHostDemoProjects = [
  defineProject({
    root,
    test: {
      name: "nextjs-host-demo",
      include: ["test/**/*.test.ts"],
      exclude: [...configDefaults.exclude, "test/storybook.test.ts"],
      environment: "node",
      testTimeout: 120_000,
      hookTimeout: 120_000,
      globalSetup,
      expect,
    },
  }),
  // `storybook dev` of the project, the longest test file of the suite: a
  // project of its own, so that CI runs it on a runner of its own.
  defineProject({
    root,
    test: {
      name: "nextjs-host-demo-storybook",
      include: ["test/storybook.test.ts"],
      environment: "node",
      testTimeout: 120_000,
      hookTimeout: 120_000,
      globalSetup,
      expect,
    },
  }),
];

export default defineConfig({
  test: {
    projects: nextjsHostDemoProjects,
  },
});
