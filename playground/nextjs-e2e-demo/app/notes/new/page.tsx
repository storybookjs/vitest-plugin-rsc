import { createNote } from "../../lib/actions.ts";

export default function NewNotePage() {
  return (
    <form action={createNote}>
      <h1>New note</h1>
      <label>
        Title <input name="title" />
      </label>
      <button>Create</button>
    </form>
  );
}
