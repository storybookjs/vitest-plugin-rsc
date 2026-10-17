import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: a page of Vite's own dev server hosts the app.
// `host/` is what a test file is to Vitest, and `host-report` what `vitest` is.
//
// `host-package` is a package of the host in `node_modules`, as a framework of
// Storybook is: a copy, not a link to the workspace, whose files are files of
// the host too. The page, the rsc layer, does not pre-bundle it, which would
// make its file with `"use client"` a chunk of a bundle, so the dev server
// gives the ids of its modules there Vite's version of the dependencies in
// their query: `?v=1a2b3c4d`.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    vitestPluginRSC(),
    vitestPluginNext({
      host: { files: ["host/**", "**/node_modules/host-package/**"], packages: ["host-report"] },
    }),
  ],
  optimizeDeps: { exclude: ["host-package"] },
  resolve: { conditions: vitestPluginRscSourceConditions },
});
