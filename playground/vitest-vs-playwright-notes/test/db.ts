import { asc, eq, sql } from "drizzle-orm";
import { db } from "#lib/db.ts";
import { hashPassword } from "#lib/password.ts";
import { notes, sessions, users, type User } from "#lib/schema.ts";

// For the tests of both runners: the app's own `db`, which is PGlite in the
// page for Vitest (lib/__mocks__/db.ts) and Postgres in Docker for Playwright.

/**
 * Empties the tables, before each test. DELETE, not TRUNCATE, which rewrites
 * the files of the tables and their indexes. And setval for the ids.
 */
export async function resetDb(): Promise<void> {
  await db.execute(sql`DELETE FROM sessions`);
  await db.execute(sql`DELETE FROM notes`);
  await db.execute(sql`DELETE FROM users`);
  await db.execute(sql`SELECT setval('users_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('notes_id_seq', 1, false)`);
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
