import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/next/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// Stands in for a service the app's server calls: it answers with the number
// of requests it has had for a key.
function hitsService(): Plugin {
  const hits = new Map<string, number>();
  return {
    name: "next-e2e-demo:hits-service",
    configureServer(server) {
      server.middlewares.use("/service/hits", (request, response) => {
        const key = new URL(request.url ?? "/", "http://localhost").searchParams.get("key") ?? "";
        hits.set(key, (hits.get(key) ?? 0) + 1);
        response.setHeader("content-type", "application/json");
        response.setHeader("cache-control", "no-store");
        response.end(JSON.stringify({ hits: hits.get(key) }));
      });
    },
  };
}

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    vitestPluginRSC(),
    // The helpers in `test/` work on the page, so they have to see the browser.
    // Every other module that is not a test file is server code.
    vitestPluginNext({ browserModules: ["test/**"] }),
    hitsService(),
  ],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
  test: {
    name: "next-e2e-demo",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
  },
});
