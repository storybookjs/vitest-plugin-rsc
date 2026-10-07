import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FavoriteButton } from "../../components/favorite-button.tsx";
import { RenameNote } from "../../components/rename-note.tsx";
import { db } from "../../lib/notes.ts";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const note = await db.getNote((await params).id);
  return { title: note?.title ?? "Not found" };
}

export default async function NotePage({ params }: Props) {
  const note = await db.getNote((await params).id);
  if (!note) notFound();
  return (
    <article>
      <h1>{note.title}</h1>
      <p>{note.body}</p>
      <FavoriteButton id={note.id} favorite={note.favorite ?? false} />
      <RenameNote id={note.id} />
    </article>
  );
}
