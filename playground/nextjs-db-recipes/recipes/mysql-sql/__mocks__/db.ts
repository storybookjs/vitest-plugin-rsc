import { mariadbTestDatabase } from "#test/mariadb.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: a pool
// of mysql2/promise, of MariaDB in the page.
const database = mariadbTestDatabase(
  "mysql_sql",
  import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

export const pool = database.mysql2Pool.promise();
