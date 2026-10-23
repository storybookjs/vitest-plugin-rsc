import { asc, eq, not } from "drizzle-orm";
import { db } from "./db.ts";
import { todos, type Todo } from "./schema.ts";

export function listTodos(): Promise<Todo[]> {
  return db.select().from(todos).orderBy(asc(todos.id));
}

export async function getTodo(id: number): Promise<Todo | undefined> {
  const [todo] = await db.select().from(todos).where(eq(todos.id, id));
  return todo;
}

export async function addTodo(title: string): Promise<void> {
  await db.insert(todos).values({ title });
}

export async function toggleTodo(id: number): Promise<void> {
  await db
    .update(todos)
    .set({ done: not(todos.done) })
    .where(eq(todos.id, id));
}

export async function renameTodo(id: number, title: string): Promise<void> {
  await db.update(todos).set({ title }).where(eq(todos.id, id));
}

export async function deleteTodo(id: number): Promise<void> {
  await db.delete(todos).where(eq(todos.id, id));
}
