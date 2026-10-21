import { LibsqlDialect } from "@libsql/kysely-libsql";
import { Kysely } from "kysely";
import { migrateToLatest } from "#test/kysely.ts";
import { libsqlTestDatabase } from "#test/libsql.ts";
import type { Database } from "../schema.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Kysely and libsql dialect, on SQLite in memory, made again for every
// test by Kysely's migrator.
const database = libsqlTestDatabase({}, () =>
  migrateToLatest(db, import.meta.glob("../migrations/*.ts", { eager: true })),
);

export const resetDb = database.reset;

export const db = new Kysely<Database>({
  // The dialect has the types of an older libsql client.
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
  dialect: new LibsqlDialect({ client: database.client as never }),
});
