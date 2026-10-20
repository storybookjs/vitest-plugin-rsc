import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../db/schema.ts";

// The data dir of the database of the tests and the stories,
// lib/__mocks__/db.ts: a database with the tables of db/schema.ts, which a
// document loads, rather than run initdb. It belongs to the schema and to the
// PGlite of node_modules, so it is not committed: vitest.config.ts and
// .storybook/vite.config.ts call this as they load, and it makes the file
// again when either changed.
const dataDir = fileURLToPath(new URL("./db.tgz", import.meta.url));
const keyFile = `${dataDir}.key`;

export async function writeDbDataDir(): Promise<void> {
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  const sql = statements.join("\n");
  // PGlite by the code of its entry, which a new version changes.
  const pglite = await readFile(createRequire(import.meta.url).resolve("@electric-sql/pglite"));
  const key = createHash("sha256").update(sql).update(pglite).digest("hex");
  const made = await readFile(keyFile, "utf8").catch(() => undefined);
  if (made === key && existsSync(dataDir)) return;
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./dump-db-data-dir.ts", import.meta.url)), dataDir],
    { input: sql, stdio: ["pipe", "inherit", "inherit"] },
  );
  await writeFile(keyFile, key);
}
