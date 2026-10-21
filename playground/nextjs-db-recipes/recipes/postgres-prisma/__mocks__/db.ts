import { PrismaPg } from "@prisma/adapter-pg";
import { pgliteTestDatabase } from "#test/pglite.ts";
import { PrismaClient } from "../generated/client.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Prisma and pg adapter, with a pool of Postgres in the page.
const database = await pgliteTestDatabase(
  "postgres_prisma",
  import.meta.glob<string>("../migrations/*/migration.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

// Prisma names the schema in its queries: the recipe's, on the server of the
// page, where the app's is `public`.
export const prisma = new PrismaClient({
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- What Prisma calls of a pool.
  adapter: new PrismaPg(database.pool as never, { schema: "postgres_prisma" }),
});
