import { rename, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Makes the data dir of test/pglite-files.ts, as the notes demo does: a
// PGlite in memory, whose data dir goes to the file of the first argument.
// In a process of its own: a PGlite keeps about 500 MB of its process after
// it closes. Without tables: lib/__mocks__/db.ts makes them, in the page.
const file = process.argv[2];
if (!file) throw new Error("The file of the data dir is the first argument.");
const client = new PGlite("memory://");
// Without the templates, which only CREATE DATABASE reads and the tables
// are not in: every document keeps the data dir in its memory, and each
// template is about 7 MB of it. One statement each, as Postgres runs DROP
// DATABASE outside a transaction only.
await client.exec(`UPDATE pg_database SET datistemplate = false WHERE datname LIKE 'template%'`);
await client.exec("DROP DATABASE template0");
await client.exec("DROP DATABASE template1");
const tarball = await client.dumpDataDir("gzip");
await client.close();

// By a rename, so that a Storybook or a Vitest that runs already reads the
// old file or the new one, never half of one.
const written = `${file}.${process.pid}`;
await writeFile(written, await tarball.bytes());
await rename(written, file);
