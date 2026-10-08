import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createNote } from "../../actions.ts";

export const metadata: Metadata = { title: "New note" };

// What failed is in a cookie of the Server Action, with what was written.
export default async function NewNotePage() {
  const failed = (await cookies()).get("new-note")?.value;
  const { error, body } = failed ? (JSON.parse(failed) as { error?: string; body?: string }) : {};
  return (
    <>
      <h1>New note</h1>
      <form action={createNote}>
        <label>
          Title <input name="title" />
        </label>
        <label>
          Body <textarea name="body" defaultValue={body} />
        </label>
        {error && <p>{error}</p>}
        <button>Create note</button>
      </form>
    </>
  );
}
