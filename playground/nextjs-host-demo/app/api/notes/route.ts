import { db } from "../../lib/notes.ts";

export async function GET(): Promise<Response> {
  return Response.json({ titles: [...db.notes.values()].map((note) => note.title) });
}
