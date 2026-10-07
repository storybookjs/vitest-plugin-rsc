import { db } from "../../lib/notes.ts";

export default async function Stats() {
  const notes = await db.listNotes();
  return <p>{notes.length} notes</p>;
}
