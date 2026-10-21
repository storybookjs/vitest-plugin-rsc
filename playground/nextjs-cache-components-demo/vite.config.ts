import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: `vite build` makes a static build of the app,
// with the page of `index.html` and `host/main.tsx` as its host. Its test is
// build-test/static-build.test.ts.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [vitestPluginRSC(), vitestPluginNext({ host: { files: ["host/**"] } })],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
});
