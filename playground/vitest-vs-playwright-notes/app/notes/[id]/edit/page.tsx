import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteForm } from "#components/note-form.tsx";
import { updateNote } from "#lib/actions.ts";
import { requireUser } from "#lib/auth.ts";
import { getNote } from "#lib/notes.ts";

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const note = await getNote(user.id, Number((await params).id));
  if (!note) notFound();
  return (
    <>
      <h1>Edit note</h1>
      <NoteForm action={updateNote.bind(null, note.id)} note={note} submitLabel="Save note" />
      <Link href={`/notes/${note.id}`}>Cancel</Link>
    </>
  );
}
