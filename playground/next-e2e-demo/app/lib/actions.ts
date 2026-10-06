"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./notes.ts";

export async function createNote(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const id = String(db.notes.size + 1);
  db.notes.set(id, { id, title, body: "" });
  (await cookies()).set("last-created", id);
  revalidatePath("/notes");
  redirect(`/notes/${id}`);
}

export async function deleteNote(id: string) {
  db.notes.delete(id);
  revalidatePath("/notes");
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const note = db.notes.get(id);
  if (!note) throw new Error(`No note ${id}`);
  note.favorite = !note.favorite;
  return note.favorite;
}
