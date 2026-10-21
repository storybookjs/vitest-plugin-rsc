import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mariadbTestDatabase } from "#test/mariadb.ts";
import { PrismaClient } from "../generated/client.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Prisma and mariadb adapter, with a pool of MariaDB in the page.
const database = mariadbTestDatabase(
  "mysql_prisma",
  import.meta.glob<string>("../migrations/*/migration.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

export const prisma = new PrismaClient({
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- What Prisma calls of a pool.
  adapter: new PrismaMariaDb(database.mariadbPool as never),
});
