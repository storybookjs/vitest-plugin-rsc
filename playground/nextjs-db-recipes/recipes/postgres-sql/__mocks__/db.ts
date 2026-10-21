import { pgliteTestDatabase } from "#test/pglite.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: a
// `pg.Pool` of Postgres in the page.
const database = await pgliteTestDatabase(
  "postgres_sql",
  import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

export const pool = database.pool;
