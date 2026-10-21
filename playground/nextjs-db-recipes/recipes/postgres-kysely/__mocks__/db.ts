import { Kysely, PostgresDialect } from "kysely";
import { migrateToLatest } from "#test/kysely.ts";
import { pgliteTestDatabase } from "#test/pglite.ts";
import type { Database } from "../schema.ts";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: the
// same Kysely and pg driver, with a pool of Postgres in the page, migrated by
// Kysely's migrator.
const database = await pgliteTestDatabase("postgres_kysely");

export const resetDb = database.reset;

export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: database.pool }) });

await migrateToLatest(db, import.meta.glob("../migrations/*.ts", { eager: true }));
await database.snapshot();
