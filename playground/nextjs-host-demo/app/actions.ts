"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./lib/notes.ts";
import { addVisit } from "./lib/visits.ts";

export async function like(id: string): Promise<void> {
  const note = await db.getNote(id);
  if (note) note.likes = (note.likes ?? 0) + 1;
  revalidatePath(`/notes/${id}`);
}

export async function setTheme(form: FormData): Promise<void> {
  (await cookies()).set("theme", String(form.get("theme")));
}

// Makes a note, and opens it. Without a title the form gets what failed,
// and what was written, in a cookie for its next render.
export async function createNote(form: FormData): Promise<void> {
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "");
  const store = await cookies();
  if (!title) {
    store.set("new-note", JSON.stringify({ error: "Title is required.", body }));
    return;
  }
  store.delete("new-note");
  const id = crypto.randomUUID();
  db.notes.set(id, { id, title, body });
  redirect(`/notes/${id}`);
}

export async function visit(): Promise<void> {
  await addVisit();
  revalidatePath("/visits");
}
