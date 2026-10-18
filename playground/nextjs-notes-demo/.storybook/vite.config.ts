import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { defineConfig } from "vite";
import * as schema from "../db/schema.ts";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";

// The Vite config of Storybook. The framework brings the plugin. In this
// repository the plugin is its source when the suite runs it.
//
// The SQL of the schema, for the database that data.ts makes in the rsc
// layer: what vitest.global-setup.ts provides to the tests.
const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));

export default defineConfig({
  resolve: { conditions: vitestPluginRscSourceConditions },
  define: { __SCHEMA_SQL__: JSON.stringify(statements.join("\n")) },
});
