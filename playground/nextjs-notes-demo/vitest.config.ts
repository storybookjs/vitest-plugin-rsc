import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["**/*.{ts,tsx}"],
      exclude: [
        ".next/**/*",
        "**/*.{test,test-fixture,mock,config}.{ts,tsx}",
        "**/*.d.ts",
        "{db,env,scripts,test}/**/*.{ts,tsx}",
        "lib/db{,.dev}.ts",
        "vitest.*.{ts,tsx}",
      ],
    },
    projects: ["./vitest.browser.config.ts", "./vitest.node.config.ts"],
  },
});
