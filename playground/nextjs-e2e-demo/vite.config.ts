import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: `vite build` makes a static build of the app,
// with the page of `index.html` and `host/main.tsx` as its host, a page
// that renders a Client Component without a page of the app, `client.html`,
// and one whose own module script renders a file of the host, `example.html`.
// Its test is build-test/static-build.test.ts. The tests of the app itself
// run with Vitest, see vitest.config.ts.

// Google Fonts, without the network: see the file.
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../vitest.google-fonts.cjs", import.meta.url),
);

// The plugin's default, which is Next's production code for `vite build`, or
// the build of `VITEST_PLUGIN_RSC_BUILD`. `pnpm perf:static` builds the app
// both ways with it, and so does the test of the build, which spawns
// `vite build` without the other variables of Vitest.
// oxlint-disable-next-line no-process-env
const build = (process.env.VITEST_PLUGIN_RSC_BUILD || undefined) as NextBuild | undefined;

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    vitestPluginRSC(),
    // The files of the host, what test files are to Vitest: they work on the
    // page, so they see the browser, and a node has the CSS of the ones
    // that render it, also in the build.
    vitestPluginNext({ host: { files: ["host/**"] }, build }),
  ],
  build: {
    rolldownOptions: {
      input: ["index.html", "client.html", "example.html"].map((page) =>
        fileURLToPath(new URL(page, import.meta.url)),
      ),
    },
  },
  resolve: { conditions: vitestPluginRscSourceConditions },
});
