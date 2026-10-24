import { PGlite } from "@electric-sql/pglite";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "#db/schema.ts";
// The files of test/pglite-files.ts, by URLs that Vite serves and that a
// build ships. By the package's import, not a relative path: Storybook
// serves this file as `lib/db.ts`.
import dataDirUrl from "#test/pglite/db.tgz?url";
import fsBundleUrl from "#test/pglite/pglite.data?url";
import pgliteWasmUrl from "#test/pglite/pglite.wasm?url";
import initdbWasmUrl from "#test/pglite/initdb.wasm?url";
import type { db as appDb } from "../db.ts";

// `#lib/db.ts` in the tests and the stories, which vitest.setup.ts and
// .storybook/preview.tsx mock with this file: a PGlite database in memory,
// one for the document, with the tables of db/schema.ts. Each test and each
// story empties it first.

// Made absolute, as on a server: the `fetch` of the server has no page to
// resolve a path against. In a worker of Node.js a module has the URL of its
// file, and the page the dev server's (the node project of vitest.config.ts).
const base = import.meta.url.startsWith("file:") ? location.href : import.meta.url;
async function fetchFile(url: string): Promise<Response> {
  const response = await fetch(new URL(url, base));
  if (!response.ok) throw new Error(`${url} of the database: ${response.status}`);
  return response;
}

// What PGlite starts from, fetched once and handed to it, so that PGlite
// fetches nothing of its own:
// - the data dir with the tables: without one, PGlite runs initdb in a
//   second PGlite, which it throws away;
// - its wasm, its initdb wasm and its file bundle, as PGlite's docs on
//   bundlers hand them. Fetched by PGlite, the wasm and the bundle stay in
//   the document's memory a second time, about 17 MB, as PGlite keeps the
//   response it reads a clone of. And PGlite starts a fetch of initdb's
//   wasm, which it never runs with a data dir and never reads.
const [loadDataDir, pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
  fetchFile(dataDirUrl).then((response) => response.blob()),
  WebAssembly.compileStreaming(fetchFile(pgliteWasmUrl)),
  WebAssembly.compileStreaming(fetchFile(initdbWasmUrl)),
  fetchFile(fsBundleUrl).then((response) => response.blob()),
]);

// Made as the module loads: what imports the database waits for its files.
// A query waits until PGlite has started. Shared buffers of 16 MB, where
// initdb writes 128 MB, which Postgres takes as it starts: the database is
// about 8 MB.
const client = new PGlite({
  loadDataDir,
  pgliteWasmModule,
  initdbWasmModule,
  fsBundle,
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
