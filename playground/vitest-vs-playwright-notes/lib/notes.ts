import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { notes, type Note } from "./schema.ts";

// The queries of every page, as prepared statements: Drizzle builds their SQL
// once, not on every render, and Postgres parses them once per connection.

const mine = eq(notes.ownerId, sql.placeholder("ownerId"));
const pattern = sql.placeholder("pattern");
const newestFavoritesFirst = [desc(notes.favorite), desc(notes.id)];

const allNotes = db
  .select()
  .from(notes)
  .where(mine)
  .orderBy(...newestFavoritesFirst)
  .prepare("all_notes");

const matchingNotes = db
  .select()
  .from(notes)
  .where(and(mine, or(ilike(notes.title, pattern), ilike(notes.content, pattern))))
  .orderBy(...newestFavoritesFirst)
  .prepare("matching_notes");

const noteCount = db.select({ count: count() }).from(notes).where(mine).prepare("note_count");

const ownNote = db
  .select()
  .from(notes)
  .where(and(eq(notes.id, sql.placeholder("id")), mine))
  .orderBy(asc(notes.id))
  .prepare("own_note");

/** The notes of the user, favorites first, then the newest; matching `query` if given. */
export function listNotes(ownerId: number, query = ""): Promise<Note[]> {
  return query
    ? matchingNotes.execute({ ownerId, pattern: `%${query}%` })
    : allNotes.execute({ ownerId });
}

export async function countNotes(ownerId: number): Promise<number> {
  const [row] = await noteCount.execute({ ownerId });
  return row?.count ?? 0;
}

/** A note of the user: another user's note is not found. */
export async function getNote(ownerId: number, id: number): Promise<Note | undefined> {
  if (!Number.isInteger(id)) return undefined;
  const [note] = await ownNote.execute({ id, ownerId });
  return note;
}
