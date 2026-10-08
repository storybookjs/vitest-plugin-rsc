import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: a page of Vite hosts the app, as a dev server and
// as a static build. `host/` is what a test file is to Vitest.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [vitestPluginRSC(), vitestPluginNext({ host: { files: ["host/**"] } })],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
});
