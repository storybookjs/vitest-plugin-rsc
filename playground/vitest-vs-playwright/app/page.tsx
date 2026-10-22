import { connection } from "next/server";
import { TodoList } from "#components/todo-list.tsx";
import { add, toggle } from "#lib/actions.ts";
import { listTodos } from "#lib/todos.ts";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { error } = await searchParams;
  const todos = await listTodos();
  const done = todos.filter((todo) => todo.done).length;
  return (
    <>
      <h1>Todos</h1>
      <p>
        {done} of {todos.length} done
      </p>
      <TodoList todos={todos} toggle={toggle} />
      <form action={add}>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" aria-invalid={error ? true : undefined} />
        {error && <p role="alert">Title is required.</p>}
        <button type="submit">Add</button>
      </form>
    </>
  );
}
