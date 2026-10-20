import { rename, writeFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { PGlite } from "@electric-sql/pglite";

// Makes the data dir of test/db-data-dir.ts: a PGlite in memory runs the SQL
// on stdin, and its data dir goes to the file of the first argument. In a
// process of its own: a PGlite keeps about 500 MB of its process after it
// closes.
const file = process.argv[2];
if (!file) throw new Error("The file of the data dir is the first argument.");
const client = new PGlite("memory://");
await client.exec(await text(process.stdin));
const tarball = await client.dumpDataDir("gzip");
await client.close();

// By a rename, so that a Storybook or a Vitest that runs already reads the
// old file or the new one, never half of one.
const written = `${file}.${process.pid}`;
await writeFile(written, await tarball.bytes());
await rename(written, file);
