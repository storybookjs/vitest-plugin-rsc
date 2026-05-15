import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/vitest-plugin-rsc/vitest.config.ts",
      "playground/rsc-vitest-demo/vitest.browser.config.ts",
      "playground/nextjs-no-msw-demo/vitest.config.ts",
      "playground/nextjs-notes-demo/vitest.browser.config.ts",
      "playground/nextjs-notes-demo/vitest.node.config.ts",
    ],
  },
});
