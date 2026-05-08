import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const optimizeDepsInclude = [
  "marked",
  "sanitize-html",
  "next/dist/client/components/app-router-instance",
  "next/dist/client/components/app-router-instance.js",
  "next/dist/client/components/redirect-boundary",
  "next/dist/client/components/redirect-boundary.js",
  "next/dist/client/components/router-reducer/compute-changed-path",
  "next/dist/client/components/router-reducer/compute-changed-path.js",
  "next/dist/client/components/router-reducer/create-initial-router-state",
  "next/dist/client/components/router-reducer/create-initial-router-state.js",
  "next/dist/client/components/use-action-queue",
  "next/dist/client/components/use-action-queue.js",
  "next/dist/shared/lib/app-router-context.shared-runtime",
  "next/dist/shared/lib/app-router-context.shared-runtime.js",
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
  "next/dist/client/components/is-next-router-error.js",
];

export default defineConfig({
  plugins: [tsconfigPaths(), react(), vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    alias: {
      "@opentelemetry/api": new URL(
        "./node_modules/@opentelemetry/api/build/esm/index.js",
        import.meta.url,
      ).pathname,
      "next/cache": new URL("./test/next-cache.ts", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    include: optimizeDepsInclude,
  },
  test: {
    testTimeout: 3000,
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./test/vitest.setup.ts"],
  },
  environments: {
    react_client: {
      optimizeDeps: {
        include: optimizeDepsInclude,
      },
    },
  },
});
