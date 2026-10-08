import { db } from "../lib/notes.ts";

export default async function BrokenPage() {
  // Fails unless a test makes it succeed.
  const note = await db.getNote("broken");
  if (!note) throw new Error("The database is down");
  return <h1>{note.title}</h1>;
}
