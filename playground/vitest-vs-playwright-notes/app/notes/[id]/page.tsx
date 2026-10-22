import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteNote, toggleFavorite } from "#lib/actions.ts";
import { requireUser } from "#lib/auth.ts";
import { getNote } from "#lib/notes.ts";

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const note = await getNote(user.id, Number((await params).id));
  if (!note) notFound();
  const { created, saved } = await searchParams;
  return (
    <>
      {created && <output>Note created.</output>}
      {saved && <output>Note saved.</output>}
      <h1>{note.title}</h1>
      {note.content ? <p>{note.content}</p> : <p>No content yet.</p>}
      <form action={toggleFavorite}>
        <input type="hidden" name="id" value={note.id} />
        <button type="submit" aria-pressed={note.favorite}>
          {note.favorite ? "Unfavorite" : "Favorite"}
        </button>
      </form>
      <form action={deleteNote}>
        <input type="hidden" name="id" value={note.id} />
        <button type="submit">Delete</button>
      </form>
      <Link href={`/notes/${note.id}/edit`}>Edit</Link> <Link href="/notes">All notes</Link>
    </>
  );
}
