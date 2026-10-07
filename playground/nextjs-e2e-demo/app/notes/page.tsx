import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { deleteNote } from "../lib/actions.ts";
import { db } from "../lib/notes.ts";

export const metadata: Metadata = { title: "All notes" };

export default async function NotesPage() {
  const notes = await db.listNotes();
  const lastCreated = (await cookies()).get("last-created")?.value;
  return (
    <>
      <h1>Notes</h1>
      {lastCreated && <p>Last created: {lastCreated}</p>}
      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            <Link href={`/notes/${note.id}`}>{note.title}</Link>{" "}
            <form action={deleteNote.bind(null, note.id)}>
              <button>Delete {note.title}</button>
            </form>
          </li>
        ))}
      </ul>
      <Link href="/notes/new">New note</Link>
    </>
  );
}
