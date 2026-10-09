import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: a page of Vite hosts the app, as a dev server and
// as a static build. `host/` is what a test file is to Vitest.
//
// So is `host-package`, a package of the host in `node_modules`, as a
// framework of Storybook is: a copy, not a link to the workspace. Vite does
// not pre-bundle it, which would make its file with "use client" a chunk of a
// bundle, and with a dev server the ids of its modules have Vite's version of
// the dependencies in their query, `?v=1a2b3c4d`.
const hostPackage = "**/node_modules/host-package/";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    vitestPluginRSC(),
    vitestPluginNext({
      host: {
        files: ["host/**", `${hostPackage}**`],
        ui: { files: [`${hostPackage}react-of-layer.js`] },
      },
    }),
  ],
  optimizeDeps: { exclude: ["host-package"] },
  resolve: {
    conditions: vitestPluginRscSourceConditions,
    // What a test would mock, the host stands in for: who is signed in.
    alias: { "@/app/lib/session.ts": fileURLToPath(new URL("./host/session.ts", import.meta.url)) },
  },
});
