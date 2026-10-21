import { PrismaLibSql } from "@prisma/adapter-libsql/web";
import { libsqlTestDatabase } from "#test/libsql.ts";
import { PrismaClient } from "../generated/client.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Prisma and libsql adapter, on SQLite in memory, made again from the
// migrations for every test.
const database = libsqlTestDatabase(
  import.meta.glob<string>("../migrations/*/migration.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;

// Prisma's adapter for libsql, with the client of the test database.
class PrismaLibSqlInMemory extends PrismaLibSql {
  override createClient() {
    return database.client;
  }
}

export const prisma = new PrismaClient({
  adapter: new PrismaLibSqlInMemory({ url: ":memory:" }),
});
