import { playwright } from "@vitest/browser-playwright";
import { defineProject, mergeConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import sharedConfig from "./vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineProject({
    plugins: [vitestPluginRSC(), vitestPluginNext()],
    test: {
      name: "nextjs-notes-demo-browser",
      include: ["**/*.test.{ts,tsx}"],
      exclude: ["**/*.node.test.{ts,tsx}", "node_modules"],
      browser: {
        enabled: true,
        headless: true,
        viewport: { width: 390, height: 844 },
        provider: playwright(),
        instances: [{ browser: "chromium" }],
      },
      // Browser workers each own their browser state and run in parallel.
      // Inside one worker, test files run sequentially with `isolate: false`,
      // so cleanup belongs in beforeEach. Do not disable file parallelism
      // and do not switch this to isolate: true for hanging state.
      isolate: false,
      globalSetup: ["./vitest.global-setup.ts"],
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
