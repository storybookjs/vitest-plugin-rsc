import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

// The plugin without Vitest: `vite build` makes a static build of the app,
// with the page of `index.html` and `host/main.tsx` as its host. Its test is
// build-test/static-build.test.ts. The tests of the app itself run with
// Vitest, see vitest.config.ts.

// Google Fonts, without the network: see the file.
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../vitest.google-fonts.cjs", import.meta.url),
);

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    vitestPluginRSC(),
    // The host works on the page, so it has to see the browser.
    vitestPluginNext({ browserModules: ["host/**"] }),
  ],
  resolve: { conditions: vitestPluginRscSourceConditions },
});
