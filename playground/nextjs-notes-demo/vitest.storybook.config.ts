import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// Node tests that run the project's Storybook, `storybook dev` and the
// static build of `storybook build`, and drive it with Playwright: see e2e/.
const root = fileURLToPath(new URL("./", import.meta.url));
const globalSetup = ["../test-helpers/storybook-framework.ts"];
// What a test waits for comes after a request that can compile or load: a
// story's first render, a Server Action, a reload, a change of a file. On CI
// that takes longer than `expect.poll`'s 1 s. A state that lasts a moment
// has a poll with its own short timeout; that something did not happen is no
// poll.
const expect = { poll: { timeout: 30_000 } };

export const nextjsNotesStorybookProjects = [
  defineProject({
    root,
    test: {
      name: "nextjs-notes-demo-storybook",
      include: ["e2e/storybook.test.ts"],
      environment: "node",
      // A test selects every story in turn.
      testTimeout: 600_000,
      hookTimeout: 120_000,
      globalSetup,
      expect,
    },
  }),
  defineProject({
    root,
    test: {
      name: "nextjs-notes-demo-storybook-after-a-change",
      include: ["e2e/storybook-after-a-change.test.ts"],
      environment: "node",
      testTimeout: 120_000,
      hookTimeout: 120_000,
      globalSetup,
      expect,
    },
  }),
  defineProject({
    root,
    test: {
      name: "nextjs-notes-demo-storybook-build",
      include: ["e2e/storybook-build.test.ts"],
      environment: "node",
      testTimeout: 600_000,
      // A build builds.
      hookTimeout: 600_000,
      globalSetup,
      expect,
    },
  }),
];
