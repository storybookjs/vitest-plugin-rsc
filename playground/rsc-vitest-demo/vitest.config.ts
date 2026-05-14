import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";

// oxlint-disable-next-line no-process-env
const browserApiPort = Number(process.env.VITEST_BROWSER_API_PORT ?? 64123);

export default defineConfig({
  plugins: [vitestPluginRSC()],
  optimizeDeps: {
    include: ["vitest-plugin-rsc > unctx"],
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/vitest.setup.ts"],
    },
    restoreMocks: true,
    browser: {
      api: browserApiPort,
      enabled: true,
      headless: true,
      provider: playwright(),
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
