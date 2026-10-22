import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "./db.ts";
import { notes, type Note } from "./schema.ts";

/** The notes of the user, favorites first, then the newest; matching `query` if given. */
export function listNotes(ownerId: number, query = ""): Promise<Note[]> {
  const mine = eq(notes.ownerId, ownerId);
  const pattern = `%${query}%`;
  return db
    .select()
    .from(notes)
    .where(query ? and(mine, or(ilike(notes.title, pattern), ilike(notes.content, pattern))) : mine)
    .orderBy(desc(notes.favorite), desc(notes.id));
}

export async function countNotes(ownerId: number): Promise<number> {
  const [row] = await db.select({ count: count() }).from(notes).where(eq(notes.ownerId, ownerId));
  return row?.count ?? 0;
}

/** A note of the user: another user's note is not found. */
export async function getNote(ownerId: number, id: number): Promise<Note | undefined> {
  if (!Number.isInteger(id)) return undefined;
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.ownerId, ownerId)))
    .orderBy(asc(notes.id));
  return note;
}
