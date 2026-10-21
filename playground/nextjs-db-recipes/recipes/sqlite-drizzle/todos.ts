import { eq } from "drizzle-orm";
import type { Todo } from "#components/todos.tsx";
import { db } from "./db.ts";
import { todos } from "./schema.ts";

export async function listTodos(): Promise<Todo[]> {
  return db.select().from(todos).orderBy(todos.id);
}

export async function addTodo(title: string): Promise<void> {
  await db.insert(todos).values({ title });
}

// In a transaction: a read and a write, on one connection.
export async function toggleTodo(id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [todo] = await tx.select().from(todos).where(eq(todos.id, id));
    if (!todo) throw new Error(`No todo #${id}`);
    await tx.update(todos).set({ done: !todo.done }).where(eq(todos.id, id));
  });
}

// All of them, or none: in a transaction, which an empty title rolls back.
export async function addTodos(titles: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const title of titles) {
      if (!title) throw new Error("A todo needs a title");
      await tx.insert(todos).values({ title });
    }
  });
}
