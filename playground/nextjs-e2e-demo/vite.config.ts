import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: `vite build` makes a static build of the app,
// with the page of `index.html` and `host/main.tsx` as its host. Its test is
// build-test/static-build.test.ts. The tests of the app itself run with
// Vitest, see vitest.config.ts.

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
    // The host works on the page, so it has to see the browser.
    vitestPluginNext({ browserModules: ["host/**"], build }),
  ],
  resolve: { conditions: vitestPluginRscSourceConditions },
});
