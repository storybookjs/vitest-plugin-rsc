import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: a page of Vite's own dev server hosts the app.
// `host/` is what a test file is to Vitest, and `host-report` what `vitest` is.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    vitestPluginRSC(),
    vitestPluginNext({ host: { files: ["host/**"], packages: ["host-report"] } }),
  ],
  resolve: { conditions: vitestPluginRscSourceConditions },
});
