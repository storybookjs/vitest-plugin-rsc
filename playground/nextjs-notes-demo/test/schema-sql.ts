import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../db/schema.ts";

// The SQL that makes the tables of db/schema.ts in an empty database, for
// the database of the tests and the stories, lib/__mocks__/db.ts: its
// `__SCHEMA_SQL__`, which vitest.config.ts and .storybook/vite.config.ts
// define. Drizzle Kit runs in Node, where the configs load.
const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));

export const schemaSQL = statements.join("\n");
