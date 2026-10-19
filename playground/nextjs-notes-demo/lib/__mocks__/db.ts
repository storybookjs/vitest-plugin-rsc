import { PGlite } from "@electric-sql/pglite";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "#db/schema.ts";
import type { db as appDb } from "../db.ts";

// What `#lib/db.ts` is in the tests and the stories, which vitest.setup.ts
// and .storybook/preview.tsx mock it with: a PGlite database in memory, one
// for the document, with the tables of db/schema.ts. Each test and each
// story empties it first.

// The SQL of the schema: see test/schema-sql.ts.
declare const __SCHEMA_SQL__: string;

// Made as the module loads, so that PGlite downloads and starts while the
// rest of the app loads. A query waits until it has.
const client = new PGlite("memory://");
const created = client.exec(__SCHEMA_SQL__);

// Drizzle on PGlite, where the app has Drizzle on node-postgres: the same
// queries, with the type of the app's.
// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- The two drivers differ in their client and raw results only.
export const db = drizzle(client, { schema }) as unknown as typeof appDb;

const tables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`);

// DELETE, where TRUNCATE would rewrite the file of every table: a few rows
// are gone in well under a millisecond, where a clone of the database takes
// over 100 ms. The replica role turns off the triggers of the foreign keys,
// so the order of the tables does not matter. DELETE does not restart a
// sequence, so `setval` does.
let emptyAllTables: Promise<string> | undefined;

async function emptyingSQL() {
  await created;
  const { rows } = await client.query<{ restart: string }>(
    `SELECT format('SELECT setval(%L, %s, false)', format('%I.%I', schemaname, sequencename), start_value) AS restart FROM pg_sequences`,
  );
  return [
    "SET session_replication_role = replica",
    ...tables.map((table) => `DELETE FROM ${table}`),
    "SET session_replication_role = DEFAULT",
    ...rows.map(({ restart }) => restart),
  ].join(";\n");
}

/** Empties every table, as before each test and each story. */
export async function resetDb(): Promise<void> {
  await client.exec(await (emptyAllTables ??= emptyingSQL()));
}
