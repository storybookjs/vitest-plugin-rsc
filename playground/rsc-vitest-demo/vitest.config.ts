import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { preview } from "@vitest/browser-preview";
import { vitestPluginRSC } from "vitest-plugin-rsc";

const browserProvider = process.env.BROWSER_PROVIDER;
const isRunMode =
  Boolean(process.env.CI) || process.argv.includes("run") || process.argv.includes("--run");

export default defineConfig({
  plugins: [vitestPluginRSC()],
  test: {
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: browserProvider === "preview" ? false : isRunMode,
      ui: !isRunMode,
      provider: browserProvider === "preview" ? preview() : playwright(),
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
