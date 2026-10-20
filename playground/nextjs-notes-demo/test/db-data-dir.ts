import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../db/schema.ts";

// The data dir of the database of the tests and the stories,
// lib/__mocks__/db.ts: a database with the tables of db/schema.ts, which a
// document loads, rather than run initdb. It belongs to the schema and to the
// PGlite of node_modules, so it is not committed: vitest.config.ts and
// .storybook/vite.config.ts call this as they load, and it makes the files
// again when either changed.
const dataDir = fileURLToPath(new URL("./db.tgz", import.meta.url));
const keyFile = `${dataDir}.key`;
const dumpScript = fileURLToPath(new URL("./dump-db-data-dir.ts", import.meta.url));

// PGlite's own files, which lib/__mocks__/db.ts fetches and hands PGlite, as
// PGlite's docs on bundlers do: the package exports none of them, so a
// document cannot import them from it. They belong to the same PGlite as the
// data dir, so they are copied with it.
const pgliteFiles = ["pglite.wasm", "initdb.wasm", "pglite.data"];
const pgliteDir = fileURLToPath(new URL("./pglite/", import.meta.url));

export async function writeDbDataDir(): Promise<void> {
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  const sql = statements.join("\n");
  // PGlite by the code of its entry, which a new version changes.
  const pgliteEntry = createRequire(import.meta.url).resolve("@electric-sql/pglite");
  const pglite = await readFile(pgliteEntry);
  const dump = await readFile(dumpScript);
  const key = createHash("sha256").update(sql).update(pglite).update(dump).digest("hex");
  const made = await readFile(keyFile, "utf8").catch(() => undefined);
  const files = [dataDir, ...pgliteFiles.map((name) => pgliteDir + name)];
  if (made === key && files.every((file) => existsSync(file))) return;
  execFileSync(process.execPath, [dumpScript, dataDir], {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
  });
  await mkdir(pgliteDir, { recursive: true });
  for (const name of pgliteFiles) {
    // By a rename, as the dump writes the data dir.
    const written = `${pgliteDir}${name}.${process.pid}`;
    await copyFile(path.join(path.dirname(pgliteEntry), name), written);
    await rename(written, pgliteDir + name);
  }
  await writeFile(keyFile, key);
}
