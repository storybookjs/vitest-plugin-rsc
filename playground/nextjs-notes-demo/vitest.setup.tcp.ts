import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, vi, type MockInstance } from "vitest";
import * as schema from "#db/schema.ts";
import { TEST_NOW } from "#test/now.ts";

// What vitest.setup.node.ts is to the node projects, for the TCP project of
// vitest.config.ts: no mock of `#lib/db.ts`. The app's own, node-postgres at
// DATABASE_URL, reaches Postgres over TCP, as on `next start`: PGlite, with
// the tables of db/schema.ts (test/pglite-files.ts), served by pglite-socket
// on a port of the loopback, in the worker. Before any module of the app
// reads the env.

const postgres = new PGlite({
  loadDataDir: new Blob([fs.readFileSync(new URL("./test/pglite/db.tgz", import.meta.url))]),
});
// The app's pool and a test's own connection at once.
const server = new PGLiteSocketServer({ db: postgres, port: 0, maxConnections: 20 });
await server.start();
// oxlint-disable-next-line no-process-env
process.env.DATABASE_URL = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;

const tables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`);
const emptyAllTables = [
  "SET session_replication_role = replica",
  ...tables.map((table) => `DELETE FROM ${table}`),
  "SET session_replication_role = DEFAULT",
].join(";\n");

let consoleError: MockInstance<typeof console.error>;

beforeEach(async () => {
  consoleError = vi.spyOn(console, "error");
  consoleError.mockClear();
  await postgres.exec(emptyAllTables);
  vi.setSystemTime(new Date(TEST_NOW));
  return () => {
    vi.useRealTimers();
  };
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});
