import { asc, sql } from "drizzle-orm";
import { db } from "#lib/db.ts";
import { todos } from "#lib/schema.ts";

// For the tests of both runners: the app's own `db`, which is PGlite in the
// page for Vitest (lib/__mocks__/db.ts) and Postgres in Docker for Playwright.

/**
 * Empties the table, before each test. DELETE, not TRUNCATE, which rewrites
 * the files of the table and its indexes, as emdr-met-bram's test/test-db.ts
 * found: about 7 ms in PGlite, where DELETE of a few rows is near free. And
 * setval, not ALTER SEQUENCE, for the ids.
 */
export async function resetDb(): Promise<void> {
  await db.execute(sql`DELETE FROM todos`);
  await db.execute(sql`SELECT setval('todos_id_seq', 1, false)`);
}

/** Adds todos with these titles, in order, the ones of `done` done. */
export async function seed(titles: string[], done: string[] = []): Promise<void> {
  await db.insert(todos).values(titles.map((title) => ({ title, done: done.includes(title) })));
}

/** The todos in the database, in order. */
export function stored() {
  return db.select({ title: todos.title, done: todos.done }).from(todos).orderBy(asc(todos.id));
}
