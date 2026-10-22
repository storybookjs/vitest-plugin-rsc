"use client";

import Link from "next/link";
import { useState } from "react";
import type { Todo } from "#lib/schema.ts";

// The list of the home page, with a filter that runs in the browser.
export function TodoList({
  todos,
  toggle,
}: {
  todos: Todo[];
  toggle: (formData: FormData) => Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  if (todos.length === 0) return <p>No todos yet</p>;
  const shown = todos.filter((todo) => todo.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <label htmlFor="filter">Filter</label>
      <input id="filter" value={filter} onChange={(event) => setFilter(event.target.value)} />
      {shown.length === 0 ? (
        <p>No todos match</p>
      ) : (
        <ul aria-label="Todos">
          {shown.map((todo) => (
            <li key={todo.id}>
              <Link href={`/todos/${todo.id}`}>{todo.title}</Link>
              {todo.done && " (done)"}
              <form action={toggle}>
                <input type="hidden" name="id" value={todo.id} />
                <button type="submit" aria-label={`${todo.done ? "Undo" : "Done"}: ${todo.title}`}>
                  {todo.done ? "Undo" : "Done"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
