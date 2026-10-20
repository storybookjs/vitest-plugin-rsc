import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// Node tests that build the host with `vite build`, in a process of its own,
// and open the build in Chromium with Playwright: see build-test/.
export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  test: {
    name: "nextjs-host-demo-build",
    include: ["build-test/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    // A build builds.
    hookTimeout: 600_000,
    globalSetup: ["../test-helpers/storybook-framework.ts"],
    // What a test waits for comes after a request that can compile or load:
    // a story's first render, a Server Action, a reload, a change of a file.
    // On CI that takes longer than `expect.poll`'s 1 s. A state that lasts a
    // moment, like Storybook's preparing block, has a poll with its own short
    // timeout; that something did not happen is no poll.
    expect: { poll: { timeout: 30_000 } },
  },
});
