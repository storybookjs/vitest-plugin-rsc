import type { Selectable } from "kysely";
import type { Todo } from "#components/todos.tsx";
import { db } from "./db.ts";
import type { Database } from "./schema.ts";

function toTodo(row: Selectable<Database["todos"]>): Todo {
  return { id: row.id, title: row.title, done: row.done, createdAt: row.created_at };
}

export async function listTodos(): Promise<Todo[]> {
  const rows = await db.selectFrom("todos").selectAll().orderBy("id").execute();
  return rows.map(toTodo);
}

export async function addTodo(title: string): Promise<void> {
  await db.insertInto("todos").values({ title }).execute();
}

// In a transaction: a read and a write, on one connection.
export async function toggleTodo(id: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const todo = await trx
      .selectFrom("todos")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    await trx.updateTable("todos").set({ done: !todo.done }).where("id", "=", id).execute();
  });
}

// All of them, or none: in a transaction, which an empty title rolls back.
export async function addTodos(titles: string[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    for (const title of titles) {
      if (!title) throw new Error("A todo needs a title");
      await trx.insertInto("todos").values({ title }).execute();
    }
  });
}
