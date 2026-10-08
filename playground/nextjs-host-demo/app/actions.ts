"use server";

import { revalidatePath } from "next/cache";
import { db } from "./lib/notes.ts";

export async function like(id: string): Promise<void> {
  const note = await db.getNote(id);
  if (note) note.likes = (note.likes ?? 0) + 1;
  revalidatePath(`/notes/${id}`);
}
