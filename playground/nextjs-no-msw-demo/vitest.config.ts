import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

// oxlint-disable-next-line no-process-env
const browserApiPort = Number(process.env.VITEST_BROWSER_API_PORT ?? 64125);

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    conditions: ["test"],
  },
  optimizeDeps: {
    include: [
      "vitest-plugin-rsc > unctx",
      "next/dist/client/components/http-access-fallback/http-access-fallback.js",
      "next/dist/client/components/redirect-error.js",
      "next/dist/client/components/redirect-status-code.js",
      "next/dist/client/components/redirect.js",
    ],
  },
  test: {
    browser: {
      api: browserApiPort,
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
