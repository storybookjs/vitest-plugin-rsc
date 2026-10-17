import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// Node tests that build the app with `vite build`, in a process of its own,
// and open the build in Chromium with Playwright: see build-test/.
export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  test: {
    name: "nextjs-e2e-demo-build",
    include: ["build-test/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    // A build builds.
    hookTimeout: 600_000,
  },
});
