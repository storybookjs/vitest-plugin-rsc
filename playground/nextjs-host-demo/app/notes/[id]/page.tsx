import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LikeButton } from "../../components/like-button.tsx";
import { db } from "../../lib/notes.ts";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const note = await db.getNote((await params).id);
  return { title: note?.title ?? "Not found" };
}

export default async function NotePage({ params }: Props) {
  const { id } = await params;
  const note = await db.getNote(id);
  if (!note) notFound();
  return (
    <article>
      <h1>{note.title}</h1>
      <p>{note.body}</p>
      <LikeButton id={id} likes={note.likes ?? 0} />
    </article>
  );
}
