import Link from "next/link";
import { NoteForm } from "#components/note-form.tsx";
import { createNote } from "#lib/actions.ts";
import { requireUser } from "#lib/auth.ts";

export default async function NewNotePage() {
  await requireUser();
  return (
    <>
      <h1>New note</h1>
      <NoteForm action={createNote} submitLabel="Create note" />
      <Link href="/notes">Cancel</Link>
    </>
  );
}
