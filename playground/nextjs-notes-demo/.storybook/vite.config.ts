import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";

// The database of a story: see test/db-data-dir.ts.
execFileSync(
  process.execPath,
  [fileURLToPath(new URL("../test/db-data-dir.ts", import.meta.url))],
  {
    stdio: "inherit",
  },
);

// The Vite config of Storybook. The framework brings the plugin. In this
// repository the plugin is its source when the suite runs it.
export default defineConfig({
  resolve: { conditions: vitestPluginRscSourceConditions },
});
