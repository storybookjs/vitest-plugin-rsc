import { kv } from "@vercel/kv";

export interface Note {
  id: string;
  created_by: string;
  title: string;
  body: string;
  updated_at: number;
}

export async function getNote(id: string) {
  return await kv.hget<Note>("notes", id);
}

export async function setNote(id: string, note: Note) {
  await kv.hset("notes", { [id]: JSON.stringify(note) });
}

export async function getAllNotes() {
  return await kv.hgetall("notes");
}
