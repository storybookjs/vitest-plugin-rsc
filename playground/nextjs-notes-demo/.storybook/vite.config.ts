import { defineConfig } from "vite";
import { writePgliteFiles } from "../test/pglite-files.ts";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";

// The database of a story: see test/pglite-files.ts.
await writePgliteFiles();

// The Vite config of Storybook. The framework brings the plugin. In this
// repository the plugin is its source when the suite runs it.
export default defineConfig({
  resolve: { conditions: vitestPluginRscSourceConditions },
});
