"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./notes.ts";
import { createSession } from "./session.ts";

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

export async function attachFile(id: string, formData: FormData) {
  const note = db.notes.get(id);
  const file = formData.get("file");
  if (!note || !(file instanceof File)) throw new Error(`No file for note ${id}`);
  note.attachment = { name: file.name, text: await file.text() };
}

export async function setLanguage(language: string) {
  (await cookies()).set("language", language);
}

export async function signIn(user: string) {
  const response = createSession(user);
  const cookieStore = await cookies();
  // A server reads `Set-Cookie` off a Response. A browser hides it.
  for (const cookie of response.headers.getSetCookie()) {
    const [name, value] = cookie.split(";")[0]!.split("=");
    cookieStore.set(name!, value!);
  }
}
