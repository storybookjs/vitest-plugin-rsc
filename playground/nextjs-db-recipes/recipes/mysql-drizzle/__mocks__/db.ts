import { drizzle } from "drizzle-orm/mysql2";
import { mariadbTestDatabase } from "#test/mariadb.ts";
import * as schema from "../schema.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Drizzle and mysql2 driver, with a pool of MariaDB in the page.
const database = mariadbTestDatabase(
  "mysql_drizzle",
  import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- What Drizzle calls of a pool.
export const db = drizzle({ client: database.mysql2Pool as never, schema, mode: "default" });
