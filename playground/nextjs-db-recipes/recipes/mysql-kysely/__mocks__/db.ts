import { Kysely, MysqlDialect } from "kysely";
import { migrateToLatest } from "#test/kysely.ts";
import { mariadbTestDatabase } from "#test/mariadb.ts";
import type { Database } from "../schema.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Kysely and mysql2 driver, with a pool of MariaDB in the page, migrated
// by Kysely's migrator.
const database = mariadbTestDatabase("mysql_kysely");

export const resetDb = database.reset;

export const db = new Kysely<Database>({
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- What Kysely calls of a pool.
  dialect: new MysqlDialect({ pool: database.mysql2Pool as never }),
});

await migrateToLatest(db, import.meta.glob("../migrations/*.ts", { eager: true }));
await database.snapshot();
