import { defineConfig } from "vite";
import { schemaSQL } from "../test/schema-sql.ts";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";

// The Vite config of Storybook. The framework brings the plugin. In this
// repository the plugin is its source when the suite runs it.
export default defineConfig({
  resolve: { conditions: vitestPluginRscSourceConditions },
  // The schema of the database of a story: see lib/__mocks__/db.ts.
  define: { __SCHEMA_SQL__: JSON.stringify(schemaSQL) },
});
