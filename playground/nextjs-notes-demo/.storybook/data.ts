import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { mocked } from "storybook/test";
import * as schema from "#db/schema.ts";
import { auth } from "#lib/auth.ts";
import * as authSessionModule from "#lib/auth-session.ts";
import * as dbModule from "#lib/db.ts";
import * as flashCookieModule from "#lib/flash-cookie.ts";

// The state of the app's server code that every server story starts from:
// what vitest.setup.ts does before every test.

const { resetDb } = dbModule as typeof import("#lib/__mocks__/db.ts");
const { setCurrentUser } = authSessionModule as typeof import("#lib/__mocks__/auth-session.ts");
const { deleteFlashCookies } = flashCookieModule as typeof import("#lib/__mocks__/flash-cookie.ts");

// The SQL of the schema: see vite.config.ts.
declare const __SCHEMA_SQL__: string;

// One database with the schema, made once, which every story gets a clone of.
let base: Promise<PGlite> | undefined;
let current: PGlite | undefined;

async function createBase() {
  const db = await PGlite.create("memory://");
  await db.exec(__SCHEMA_SQL__);
  return db;
}

/** Nobody signed in, no flash cookies, the mocks of Better Auth as they were, and an empty database. */
export async function reset(): Promise<void> {
  setCurrentUser(null);
  deleteFlashCookies();
  for (const spy of Object.values(auth.api)) mocked(spy).mockReset();
  if (current && !current.closed) await current.close();
  const clone = await (await (base ??= createBase())).clone();
  if (!(clone instanceof PGlite)) {
    throw new TypeError("Expected PGlite.clone() to return a PGlite instance");
  }
  current = clone;
  resetDb(drizzle(clone, { schema }));
}
