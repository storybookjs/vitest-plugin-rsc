// The page of every recipe: the todos, a form that adds one, and a button
// per todo that marks it done. The recipe brings the queries and the Server
// Actions.

export type Todo = { id: number; title: string; done: boolean; createdAt: Date };

export function Todos({
  title,
  todos,
  add,
  toggle,
}: {
  title: string;
  todos: Todo[];
  add: (formData: FormData) => Promise<void>;
  toggle: (formData: FormData) => Promise<void>;
}) {
  return (
    <>
      <h1>{title}</h1>
      {todos.length === 0 ? (
        <p>No todos</p>
      ) : (
        <ul aria-label="Todos">
          {todos.map((todo) => (
            <li key={todo.id}>
              <form action={toggle}>
                <input type="hidden" name="id" value={todo.id} />
                <span>
                  #{todo.id} {todo.title}
                  {todo.done ? " (done)" : ""}
                </span>{" "}
                <time dateTime={todo.createdAt.toISOString()}>{todo.createdAt.toISOString()}</time>{" "}
                <button type="submit">
                  {todo.done ? "Undo" : "Done"}: {todo.title}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={add}>
        <label>
          Title <input name="title" required />
        </label>
        <button type="submit">Add</button>
      </form>
    </>
  );
}
