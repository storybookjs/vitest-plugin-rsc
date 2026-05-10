"use server";

import { db } from "../lib/db.ts";

export async function saveToDb(id: number, count: number) {
  db.set(id, count);
  console.log(`saving that ${id} has ${count} likes`);
}
