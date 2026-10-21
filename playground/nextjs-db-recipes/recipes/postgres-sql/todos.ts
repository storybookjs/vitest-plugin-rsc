import type { Todo } from "#components/todos.tsx";
import { pool } from "./db.ts";

type Row = { id: number; title: string; done: boolean; created_at: Date };

export async function listTodos(): Promise<Todo[]> {
  const { rows } = await pool.query<Row>(
    "SELECT id, title, done, created_at FROM todos ORDER BY id",
  );
  return rows.map(({ id, title, done, created_at }) => ({
    id,
    title,
    done,
    createdAt: created_at,
  }));
}

export async function addTodo(title: string): Promise<void> {
  await pool.query("INSERT INTO todos (title) VALUES ($1)", [title]);
}

// In a transaction, on a client of the pool: a read and a write.
export async function toggleTodo(id: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Row>("SELECT done FROM todos WHERE id = $1 FOR UPDATE", [
      id,
    ]);
    if (!rows[0]) throw new Error(`No todo #${id}`);
    await client.query("UPDATE todos SET done = $1 WHERE id = $2", [!rows[0].done, id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// All of them, or none: in a transaction, which an empty title rolls back.
export async function addTodos(titles: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const title of titles) {
      if (!title) throw new Error("A todo needs a title");
      await client.query("INSERT INTO todos (title) VALUES ($1)", [title]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
