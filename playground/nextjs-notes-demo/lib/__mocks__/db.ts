import { PGlite } from "@electric-sql/pglite";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "#db/schema.ts";
import dataDirUrl from "#lib/__mocks__/db.tgz?url";
import type { db as appDb } from "../db.ts";

// `#lib/db.ts` in the tests and the stories, which vitest.setup.ts and
// .storybook/preview.tsx mock with this file: a PGlite database in memory,
// one for the document, with the tables of db/schema.ts. Each test and each
// story empties it first.

// The tables, in the data dir of test/db-data-dir.ts, which PGlite loads:
// without one, it runs initdb in a second PGlite, which it throws away. A
// URL that Vite serves, and that a build ships. By the package's import,
// not a relative path: Storybook serves this file as `lib/db.ts`. Made
// absolute, as on a server: the `fetch` of the server has no page to
// resolve a path against.
const response = await fetch(new URL(dataDirUrl, import.meta.url));
if (!response.ok) throw new Error(`The data dir of the database: ${response.status}`);

// Made as the module loads, so that PGlite starts while the rest of the app
// loads. A query waits until it has. Shared buffers of 16 MB, where initdb
// writes 128 MB, which Postgres takes as it starts: the database is about
// 7 MB.
const client = new PGlite({
  loadDataDir: await response.blob(),
  startParams: [...PGlite.defaultStartParams, "-c", "shared_buffers=16MB"],
});

// Drizzle on PGlite, where the app has Drizzle on node-postgres: the same
// queries. Typed as the app's `db`, so that a setup file can cast
// `#lib/db.ts` to this module, for `resetDb`.
// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- The two drivers differ in their client and raw results only.
export const db = drizzle(client, { schema }) as unknown as typeof appDb;

const tables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`);

// DELETE, where TRUNCATE would rewrite the file of every table: a few rows
// are gone in well under a millisecond. The replica role turns off the
// triggers of the foreign keys, so the order of the tables does not matter.
// The schema has no sequence to restart.
const emptyAllTables = [
  "SET session_replication_role = replica",
  ...tables.map((table) => `DELETE FROM ${table}`),
  "SET session_replication_role = DEFAULT",
].join(";\n");

/** Empties every table, as before each test and each story. */
export async function resetDb(): Promise<void> {
  await client.exec(emptyAllTables);
}
