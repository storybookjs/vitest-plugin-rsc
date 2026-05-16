import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    conditions: [...vitestPluginRscSourceConditions, "test"],
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
    name: "nextjs-no-msw-demo",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules"],
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
