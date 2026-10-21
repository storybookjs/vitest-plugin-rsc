import { drizzle } from "drizzle-orm/libsql/wasm";
import { libsqlTestDatabase } from "#test/libsql.ts";
import * as schema from "../schema.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Drizzle and libsql client, on SQLite in memory, made again from the
// migrations for every test.
const database = libsqlTestDatabase(
  import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

export const db = drizzle(database.client, { schema });
