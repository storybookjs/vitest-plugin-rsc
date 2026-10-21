import { drizzle } from "drizzle-orm/node-postgres";
import { pgliteTestDatabase } from "#test/pglite.ts";
import * as schema from "../schema.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Drizzle and pg driver, with a pool of Postgres in the page.
const database = await pgliteTestDatabase(
  "postgres_drizzle",
  import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- What Drizzle calls of a pool.
export const db = drizzle({ client: database.pool as never, schema });
