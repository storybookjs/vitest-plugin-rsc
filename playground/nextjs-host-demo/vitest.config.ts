import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// Node tests that start the app with the CLIs of Vite and Storybook, in a
// process of its own, and drive Chromium with Playwright: see test/helpers.ts.
export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  test: {
    name: "nextjs-host-demo",
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    // A dev server starts, a build builds.
    hookTimeout: 600_000,
    // One file at a time: a build writes into the project, where the dev
    // server of the other file would see a change and load the page again.
    fileParallelism: false,
  },
});
