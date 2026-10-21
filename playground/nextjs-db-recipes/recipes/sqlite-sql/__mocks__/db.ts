import { libsqlTestDatabase } from "#test/libsql.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: a
// libsql client, on SQLite in memory, made again from the migrations for
// every test.
const database = libsqlTestDatabase(
  import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

export const client = database.client;
