import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// The tests start the dev server of vite.config.ts, as a host without Vitest
// does, and drive it with Playwright: see test/host.test.ts.
export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  test: {
    name: "nextjs-host-demo",
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ["../test-helpers/storybook-framework.ts"],
  },
});
