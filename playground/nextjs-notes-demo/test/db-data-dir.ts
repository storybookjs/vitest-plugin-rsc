import { rename, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../db/schema.ts";

// The data dir of the database of the tests and the stories,
// lib/__mocks__/db.ts: a database with the tables of db/schema.ts, which a
// document loads, rather than run initdb. vitest.config.ts and
// .storybook/vite.config.ts run this file with Node as they load, in a
// process of its own: a PGlite keeps about 500 MB of its process after it
// closes. The file belongs to the PGlite of node_modules, so it is made at
// each load, and not committed.
const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
const client = new PGlite("memory://");
await client.exec(statements.join("\n"));
const tarball = await client.dumpDataDir("gzip");
await client.close();

// By a rename, so that a document of a Storybook or a Vitest that runs
// already reads the old file or the new one, never half of one.
const dataDir = new URL("../lib/__mocks__/db.tgz", import.meta.url);
const written = new URL(`db.tgz.${process.pid}`, dataDir);
await writeFile(written, await tarball.bytes());
await rename(written, dataDir);
