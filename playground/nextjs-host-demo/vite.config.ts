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
// their query: `?v=1a2b3c4d`. Its `ui/` is no file of the host: a Client
// Component of a package that the app's layers have, with a stylesheet, like
// one of a UI library. So `host.files` has only the `*.js` at the top of the
// package: the CSS that a file of the host imports in the browser layer is
// Vite's `<style>`, never a link, see styles.ts.
//
// `vite build` builds the pages of the host into a static site, with the
// files of the host that have `"use client"` and the page's own `host-report`:
// see build-test/static-build.test.ts. Served from anywhere, `base: "./"`,
// as Storybook builds: a file of the build names another one by the way
// from itself. `nested/index.html` is the page of index.html in a directory
// of its own.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  base: "./",
  plugins: [
    vitestPluginRSC(),
    vitestPluginNext({
      host: { files: ["host/**", "**/node_modules/host-package/*.js"], packages: ["host-report"] },
    }),
  ],
  optimizeDeps: { exclude: ["host-package"] },
  build: {
    rolldownOptions: {
      input: ["index.html", "callout.html", "nested/index.html"].map((page) =>
        fileURLToPath(new URL(page, import.meta.url)),
      ),
    },
  },
  resolve: {
    conditions: vitestPluginRscSourceConditions,
    // An alias of React to itself, which a host or another plugin may add,
    // changes nothing: each layer still gets Next's React. See "Three
    // Layers, Three Environments" in docs/next-routes.md.
    alias: { react: "react", "react-dom": "react-dom" },
  },
});
