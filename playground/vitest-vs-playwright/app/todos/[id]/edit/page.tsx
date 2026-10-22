import Link from "next/link";
import { notFound } from "next/navigation";
import { rename } from "#lib/actions.ts";
import { getTodo } from "#lib/todos.ts";

export default async function EditTodoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const todo = await getTodo(Number((await params).id));
  if (!todo) notFound();
  const { error } = await searchParams;
  return (
    <>
      <h1>Edit todo</h1>
      <form action={rename}>
        <input type="hidden" name="id" value={todo.id} />
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          defaultValue={todo.title}
          aria-invalid={error ? true : undefined}
        />
        {error && <p role="alert">Title is required.</p>}
        <button type="submit">Save</button>
      </form>
      <Link href={`/todos/${todo.id}`}>Cancel</Link>
    </>
  );
}
