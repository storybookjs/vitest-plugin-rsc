import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../db/schema.ts";

// What the database of the tests and the stories, lib/__mocks__/db.ts,
// hands PGlite, in test/pglite/:
// - a data dir with the tables of db/schema.ts, which PGlite loads rather
//   than run initdb;
// - PGlite's wasm, its initdb wasm and its file bundle, which a document
//   fetches itself, as PGlite's docs on bundlers do: the package exports
//   none of them, so a document cannot import them from it.
// They belong to the schema and to the PGlite of node_modules, so they are
// not committed: vitest.config.ts and .storybook/vite.config.ts call this as
// they load, and it makes them again when the schema, PGlite or the dump
// script changed.
const dir = fileURLToPath(new URL("./pglite/", import.meta.url));
const dataDir = path.join(dir, "db.tgz");
const keyFile = path.join(dir, "key");
const dumpScript = fileURLToPath(new URL("./dump-db-data-dir.ts", import.meta.url));
const pgliteFiles = ["pglite.wasm", "initdb.wasm", "pglite.data"];

export async function writePgliteFiles(): Promise<void> {
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  const sql = statements.join("\n");
  // PGlite by its CommonJS entry, one bundle of all of its code, which a new
  // version changes.
  const pgliteEntry = createRequire(import.meta.url).resolve("@electric-sql/pglite");
  const pglite = await readFile(pgliteEntry);
  const dump = await readFile(dumpScript);
  const key = createHash("sha256").update(sql).update(pglite).update(dump).digest("hex");
  const made = await readFile(keyFile, "utf8").catch(() => undefined);
  const files = [dataDir, ...pgliteFiles.map((name) => path.join(dir, name))];
  if (made === key && files.every((file) => existsSync(file))) return;
  await mkdir(dir, { recursive: true });
  execFileSync(process.execPath, [dumpScript, dataDir], {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
  });
  for (const name of pgliteFiles) {
    // By a rename, as the dump writes the data dir.
    const written = path.join(dir, `${name}.${process.pid}`);
    await copyFile(path.join(path.dirname(pgliteEntry), name), written);
    await rename(written, path.join(dir, name));
  }
  await writeFile(keyFile, key);
}
