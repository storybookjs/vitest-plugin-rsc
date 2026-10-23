import { asc, eq } from "drizzle-orm";
import { db } from "#lib/db.ts";
import { hashPassword } from "#lib/password.ts";
import { notes, sessions, users, type User } from "#lib/schema.ts";

// For the tests of both runners: the app's own `db`, which is PGlite in the
// page for Vitest (lib/__mocks__/db.ts) and Postgres in Docker for Playwright.

// The statements of `resetDb()`, sent at once: one round trip, where five
// took one each. DELETE, not TRUNCATE, which rewrites the files of the tables
// and their indexes. And setval for the ids.
const emptyTables = [
  "DELETE FROM sessions",
  "DELETE FROM notes",
  "DELETE FROM users",
  "SELECT setval('users_id_seq', 1, false)",
  "SELECT setval('notes_id_seq', 1, false)",
].join(";\n");

/**
 * Empties the tables, before each test. By the client of the driver: a query
 * of drizzle is one statement. PGlite's `exec()` and the `query()` of `pg`
 * without parameters take several.
 */
export async function resetDb(): Promise<void> {
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- PGlite in the page, a pool of `pg` for Playwright.
  const client = db.$client as unknown as {
    exec?: (sql: string) => Promise<unknown>;
    query: (sql: string) => Promise<unknown>;
  };
  await (client.exec ? client.exec(emptyTables) : client.query(emptyTables));
}

export const ada = { name: "Ada Lovelace", email: "ada@example.com", password: "correct horse" };
export const grace = {
  name: "Grace Hopper",
  email: "grace@example.com",
  password: "battery staple",
};

/** A user with this password, as after signing up. */
export async function createUser(person: typeof ada = ada): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      name: person.name,
      email: person.email,
      passwordHash: await hashPassword(person.password),
    })
    .returning();
  return user!;
}

/** A session of the user, as after signing in: the value of its cookie. */
export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomUUID();
  await db.insert(sessions).values({ token, userId });
  return token;
}

type NewNote = { title: string; content?: string; favorite?: boolean };

/** Notes of the user, in this order: the last is the newest. */
export function seedNotes(ownerId: number, list: NewNote[]) {
  return db
    .insert(notes)
    .values(list.map((note) => ({ ownerId, ...note })))
    .returning();
}

/** The notes in the database, in order. */
export function storedNotes() {
  return db
    .select({ title: notes.title, content: notes.content, favorite: notes.favorite })
    .from(notes)
    .orderBy(asc(notes.id));
}

export async function storedUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function sessionCount(): Promise<number> {
  return (await db.select().from(sessions)).length;
}
