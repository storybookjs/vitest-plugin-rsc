import Link from "next/link";
import { notFound } from "next/navigation";
import { remove, toggle } from "#lib/actions.ts";
import { getTodo } from "#lib/todos.ts";

export default async function TodoPage({ params }: { params: Promise<{ id: string }> }) {
  const todo = await getTodo(Number((await params).id));
  if (!todo) notFound();
  return (
    <>
      <h1>{todo.title}</h1>
      <p>Status: {todo.done ? "Done" : "Open"}</p>
      <form action={toggle}>
        <input type="hidden" name="id" value={todo.id} />
        <button type="submit">{todo.done ? "Mark open" : "Mark done"}</button>
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={todo.id} />
        <button type="submit">Delete</button>
      </form>
      <Link href={`/todos/${todo.id}/edit`}>Edit</Link> <Link href="/">All todos</Link>
    </>
  );
}
