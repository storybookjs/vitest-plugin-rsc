import { asc, eq, inArray } from "drizzle-orm";
import { db } from "#lib/db.ts";
import { hashPassword } from "#lib/password.ts";
import { notes, sessions, users, type User } from "#lib/schema.ts";
import type { Person } from "./people.ts";

// For the tests of both runners: the app's own `db`, which is PGlite in the
// page for Vitest (lib/__mocks__/db.ts) and Postgres in Docker for Playwright.
// Nothing empties it between tests: each test reads the rows of its own
// users, and takes the ids of its notes from the rows `seedNotes()` returns.

/** A user with this password, as after signing up. */
export async function createUser(person: Person): Promise<User> {
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

/** The notes of these users in the database, in order. */
export function storedNotes(ownerId: number, ...others: number[]) {
  return db
    .select({ title: notes.title, content: notes.content, favorite: notes.favorite })
    .from(notes)
    .where(inArray(notes.ownerId, [ownerId, ...others]))
    .orderBy(asc(notes.id));
}

export async function storedUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function sessionCount(userId: number): Promise<number> {
  return (await db.select().from(sessions).where(eq(sessions.userId, userId))).length;
}
