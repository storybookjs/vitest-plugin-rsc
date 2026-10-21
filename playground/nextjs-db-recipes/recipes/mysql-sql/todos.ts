import type { RowDataPacket } from "mysql2";
import type { Todo } from "#components/todos.tsx";
import { pool } from "./db.ts";

type Row = RowDataPacket & { id: number; title: string; done: number; created_at: Date };

export async function listTodos(): Promise<Todo[]> {
  const [rows] = await pool.query<Row[]>(
    "SELECT id, title, done, created_at FROM todos ORDER BY id",
  );
  return rows.map(({ id, title, done, created_at }) => ({
    id,
    title,
    done: done === 1,
    createdAt: created_at,
  }));
}

export async function addTodo(title: string): Promise<void> {
  await pool.query("INSERT INTO todos (title) VALUES (?)", [title]);
}

// In a transaction, on a connection of the pool: a read and a write.
export async function toggleTodo(id: number): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<Row[]>("SELECT done FROM todos WHERE id = ? FOR UPDATE", [
      id,
    ]);
    if (!rows[0]) throw new Error(`No todo #${id}`);
    await connection.query("UPDATE todos SET done = ? WHERE id = ?", [rows[0].done ? 0 : 1, id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// All of them, or none: in a transaction, which an empty title rolls back.
export async function addTodos(titles: string[]): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const title of titles) {
      if (!title) throw new Error("A todo needs a title");
      await connection.query("INSERT INTO todos (title) VALUES (?)", [title]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
