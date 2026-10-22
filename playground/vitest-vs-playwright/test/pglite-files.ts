import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// What lib/__mocks__/db.ts hands PGlite, in test/pglite/, as the notes demo does:
// - a data dir, which PGlite loads rather than run initdb in the page;
// - PGlite's wasm, its initdb wasm and its file bundle, which the page
//   fetches itself, as PGlite's docs on bundlers do: the package exports none
//   of them, so a page cannot import them from it.
// They belong to the PGlite of node_modules, so they are not committed:
// vitest.config.ts calls this as it loads, and it makes them again when
// PGlite or the dump script changed.
const dir = fileURLToPath(new URL("./pglite/", import.meta.url));
const dataDir = path.join(dir, "db.tgz");
const keyFile = path.join(dir, "key");
const dumpScript = fileURLToPath(new URL("./dump-db-data-dir.ts", import.meta.url));
const pgliteFiles = ["pglite.wasm", "initdb.wasm", "pglite.data"];

export async function writePgliteFiles(): Promise<void> {
  // PGlite by its CommonJS entry, one bundle of all of its code, which a new
  // version changes.
  const pgliteEntry = createRequire(import.meta.url).resolve("@electric-sql/pglite");
  const pglite = await readFile(pgliteEntry);
  const dump = await readFile(dumpScript);
  const key = createHash("sha256").update(pglite).update(dump).digest("hex");
  const made = await readFile(keyFile, "utf8").catch(() => undefined);
  const files = [dataDir, ...pgliteFiles.map((name) => path.join(dir, name))];
  if (made === key && files.every((file) => existsSync(file))) return;
  await mkdir(dir, { recursive: true });
  execFileSync(process.execPath, [dumpScript, dataDir], { stdio: "inherit" });
  for (const name of pgliteFiles) {
    // By a rename, as the dump writes the data dir.
    const written = path.join(dir, `${name}.${process.pid}`);
    await copyFile(path.join(path.dirname(pgliteEntry), name), written);
    await rename(written, path.join(dir, name));
  }
  await writeFile(keyFile, key);
}
