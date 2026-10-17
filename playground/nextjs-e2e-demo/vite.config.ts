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

// Next's development code, or its production code with
// `VITEST_PLUGIN_RSC_BUILD=production`, as for the tests in vitest.config.ts.
// `pnpm perf:static` builds the app both ways with it. The test of the build
// spawns `vite build` without the variables of Vitest, so it builds the default.
// oxlint-disable-next-line no-process-env
const build = (process.env.VITEST_PLUGIN_RSC_BUILD || "development") as NextBuild;

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    vitestPluginRSC(),
    // The host works on the page, so it has to see the browser.
    vitestPluginNext({ browserModules: ["host/**"], build }),
  ],
  resolve: { conditions: vitestPluginRscSourceConditions },
});
