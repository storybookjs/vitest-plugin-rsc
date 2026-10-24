"use client";
// The client tree of the notes list page plus the new-note form, from static
// props: app/layout.tsx + app/notes/page.tsx as they render, with
// components/note-form.tsx and a favorite toggle as interactive client parts.
import Link from "next/link";
import { useState } from "react";
import { NoteForm } from "#components/note-form.tsx";
import { createNote } from "#lib/actions.ts";

type Note = { id: number; title: string; favorite: boolean };

function FavoriteButton({ note, onToggle }: { note: Note; onToggle: (id: number) => void }) {
  return (
    <button type="button" onClick={() => onToggle(note.id)}>
      {note.favorite ? `Unfavorite ${note.title}` : `Favorite ${note.title}`}
    </button>
  );
}

function NotesPage({ initial, query }: { initial: Note[]; query: string }) {
  const [notes, setNotes] = useState(initial);
  const toggle = (id: number) =>
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)));
  const favorites = notes.filter((n) => n.favorite).length;
  return (
    <>
      <output>Welcome, Grace!</output>
      <h1>Notes</h1>
      <p>{notes.length === 1 ? "1 note" : `${notes.length} notes`}</p>
      <p>{`${favorites} favorites`}</p>
      <form action="/notes" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="q">Search</label>
        <input id="q" name="q" type="search" defaultValue={query} />
        <button type="submit">Search</button>
      </form>
      <Link href="/notes/new">New note</Link>
      <ul aria-label="Notes">
        {notes.map((note) => (
          <li key={note.id}>
            <Link href={`/notes/${note.id}`}>{note.title}</Link>
            {note.favorite && <span> ★ Favorite</span>}
            <FavoriteButton note={note} onToggle={toggle} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function App({ notes }: { notes: Note[] }) {
  return (
    <>
      <header>
        <nav aria-label="Main">
          <Link href="/notes">Notes</Link> <Link href="/profile">Profile</Link>{" "}
          <span>Signed in as Grace</span>
          <form action="/sign-out" onSubmit={(e) => e.preventDefault()}>
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      <main>
        <NotesPage initial={notes} query="" />
        <section aria-label="New note">
          <NoteForm action={createNote} submitLabel="Create note" />
        </section>
      </main>
    </>
  );
}

export const seed: Note[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: `Note ${i + 1}`,
  favorite: i % 5 === 0,
}));
