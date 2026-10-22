import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema.ts";
import schemaSql from "../schema.sql?raw";
import dataDirUrl from "#test/pglite/db.tgz?url";
import fsBundleUrl from "#test/pglite/pglite.data?url";
import pgliteWasmUrl from "#test/pglite/pglite.wasm?url";
import initdbWasmUrl from "#test/pglite/initdb.wasm?url";
import type { db as appDb } from "../db.ts";

// `#lib/db.ts` in the Vitest tests: Postgres in the page, PGlite, in memory,
// with the tables of schema.sql. As the notes demo starts it: from a data dir
// that Node.js made (test/pglite-files.ts), with its files fetched once.

async function fetchFile(url: string): Promise<Response> {
  const response = await fetch(new URL(url, import.meta.url));
  if (!response.ok) throw new Error(`${url} of the database: ${response.status}`);
  return response;
}

const [loadDataDir, pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
  fetchFile(dataDirUrl).then((response) => response.blob()),
  WebAssembly.compileStreaming(fetchFile(pgliteWasmUrl)),
  WebAssembly.compileStreaming(fetchFile(initdbWasmUrl)),
  fetchFile(fsBundleUrl).then((response) => response.blob()),
]);

const client = await PGlite.create({
  loadDataDir,
  pgliteWasmModule,
  initdbWasmModule,
  fsBundle,
  startParams: [...PGlite.defaultStartParams, "-c", "shared_buffers=16MB"],
});
await client.exec(schemaSql);

// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- The two drivers differ in their client and raw results only.
export const db = drizzle(client, { schema }) as unknown as typeof appDb;
