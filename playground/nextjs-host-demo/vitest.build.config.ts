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
  },
});
