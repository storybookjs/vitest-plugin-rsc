import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: `vite build` makes a static build of the Server
// Components of `index.html` and `host/main.tsx`, the host. Its test is
// build-test/static-build.test.ts. The tests of the components run with
// Vitest, see vitest.config.ts.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // A build that is served from any path: a file of it names another by the
  // way from itself.
  base: "./",
  plugins: [vitestPluginRSC()],
  resolve: { conditions: vitestPluginRscSourceConditions },
});
