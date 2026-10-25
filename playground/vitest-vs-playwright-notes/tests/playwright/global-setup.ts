import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "#lib/db.ts";

// The tables of schema.sql on the Postgres of the tests, as lib/__mocks__/db.ts
// makes them on PGlite, emptied once per run: the tests don't empty them, so
// each run would add its users and notes to the last run's.
export default async function globalSetup(): Promise<void> {
  const schema = await readFile(new URL("../../lib/schema.sql", import.meta.url), "utf8");
  await db.execute(sql.raw(schema));
  await db.execute(sql`TRUNCATE sessions, notes, users RESTART IDENTITY`);
  await db.$client.end();
}
