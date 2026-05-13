import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    conditions: ["test"],
  },
  optimizeDeps: {
    include: [
      "next/dist/client/components/http-access-fallback/http-access-fallback.js",
      "next/dist/client/components/redirect-error.js",
      "next/dist/client/components/redirect-status-code.js",
      "next/dist/client/components/redirect.js",
    ],
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
