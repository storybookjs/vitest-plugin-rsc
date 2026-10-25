import Link from "next/link";
import { requireUser } from "#lib/auth.ts";
import { countNotes, listNotes } from "#lib/notes.ts";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; welcome?: string; deleted?: string }>;
}) {
  const user = await requireUser();
  const { q = "", welcome, deleted } = await searchParams;
  const query = q.trim();
  const [notes, count] = await Promise.all([
    listNotes(user.id, query),
    // Without a search the list has every note of the user: its length is the count.
    query ? countNotes(user.id) : undefined,
  ]);
  const total = count ?? notes.length;
  return (
    <>
      {welcome && <output>Welcome, {user.name}!</output>}
      {deleted && <output>Note deleted.</output>}
      <h1>Notes</h1>
      <p>{total === 1 ? "1 note" : `${total} notes`}</p>
      <form action="/notes">
        <label htmlFor="q">Search</label>
        <input id="q" name="q" type="search" defaultValue={query} />
        <button type="submit">Search</button>
      </form>
      {query && (
        <p>{`${notes.length === 1 ? "1 result" : `${notes.length} results`} for “${query}”`}</p>
      )}
      <Link href="/notes/new">New note</Link>
      {notes.length === 0 ? (
        <p>{query ? `No notes match “${query}”.` : "No notes yet"}</p>
      ) : (
        <ul aria-label="Notes">
          {notes.map((note) => (
            <li key={note.id}>
              <Link href={`/notes/${note.id}`}>{note.title}</Link>
              {note.favorite && <span> ★ Favorite</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
