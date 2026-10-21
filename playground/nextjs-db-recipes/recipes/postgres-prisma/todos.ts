import type { Todo } from "#components/todos.tsx";
import { prisma } from "./db.ts";

export async function listTodos(): Promise<Todo[]> {
  return prisma.todo.findMany({ orderBy: { id: "asc" } });
}

export async function addTodo(title: string): Promise<void> {
  await prisma.todo.create({ data: { title } });
}

// In an interactive transaction: a read and a write, on one connection.
export async function toggleTodo(id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const todo = await tx.todo.findUniqueOrThrow({ where: { id } });
    await tx.todo.update({ where: { id }, data: { done: !todo.done } });
  });
}

// All of them, or none: in a transaction, which an empty title rolls back.
export async function addTodos(titles: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const title of titles) {
      if (!title) throw new Error("A todo needs a title");
      await tx.todo.create({ data: { title } });
    }
  });
}
