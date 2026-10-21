import type { Todo } from "#components/todos.tsx";
import { client } from "./db.ts";

export async function listTodos(): Promise<Todo[]> {
  const { rows } = await client.execute(
    "SELECT id, title, done, created_at FROM todos ORDER BY id",
  );
  return rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    done: row.done === 1,
    createdAt: new Date(Number(row.created_at)),
  }));
}

export async function addTodo(title: string): Promise<void> {
  await client.execute({
    sql: "INSERT INTO todos (title, created_at) VALUES (?, ?)",
    args: [title, Date.now()],
  });
}

// In a transaction of libsql: a read and a write.
export async function toggleTodo(id: number): Promise<void> {
  const transaction = await client.transaction("write");
  try {
    const { rows } = await transaction.execute({
      sql: "SELECT done FROM todos WHERE id = ?",
      args: [id],
    });
    if (!rows[0]) throw new Error(`No todo #${id}`);
    await transaction.execute({
      sql: "UPDATE todos SET done = ? WHERE id = ?",
      args: [rows[0].done === 1 ? 0 : 1, id],
    });
    await transaction.commit();
  } finally {
    transaction.close();
  }
}

// All of them, or none: in a transaction, which an empty title rolls back.
export async function addTodos(titles: string[]): Promise<void> {
  const transaction = await client.transaction("write");
  try {
    for (const title of titles) {
      if (!title) throw new Error("A todo needs a title");
      await transaction.execute({
        sql: "INSERT INTO todos (title, created_at) VALUES (?, ?)",
        args: [title, Date.now()],
      });
    }
    await transaction.commit();
  } finally {
    // Without a commit, a rollback.
    transaction.close();
  }
}
