import { defineConfig } from "vite";
import { writeDbDataDir } from "../test/db-data-dir.ts";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";

// The database of a story: see test/db-data-dir.ts.
await writeDbDataDir();

// The Vite config of Storybook. The framework brings the plugin. In this
// repository the plugin is its source when the suite runs it.
export default defineConfig({
  resolve: { conditions: vitestPluginRscSourceConditions },
});
