import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import "#env/load-next.ts";

// Make Vitest UI trace/source clicks a no-op instead of opening Cursor.
// oxlint-disable-next-line no-process-env
process.env.LAUNCH_EDITOR = "/usr/bin/true";

// oxlint-disable-next-line no-process-env
const maxWorkers = process.env.CI ? undefined : 4;

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envPrefix: ["VITE_", "CI"],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "vitest/suite": "@vitest/runner",
    },
    conditions: ["test"],
  },
  optimizeDeps: {
    include: [
      "next/dist/client/components/http-access-fallback/http-access-fallback.js",
      "next/dist/client/components/redirect-error.js",
      "next/dist/client/components/redirect-status-code.js",
      "next/dist/client/components/redirect.js",
      "next/dist/client/components/router-reducer/create-href-from-url.js",
      "next/dist/server/lib/server-action-request-meta.js",
    ],
  },
  test: {
    maxWorkers,
  },
});
