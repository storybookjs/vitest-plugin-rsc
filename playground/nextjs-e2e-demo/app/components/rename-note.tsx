"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Calls the route handler of the note with a plain `fetch`, as a Client
// Component does, and asks the router for the page again.
export function RenameNote({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState("");

  async function rename(formData: FormData) {
    const response = await fetch(`/api/notes/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: formData.get("title") }),
    });
    const { note, editor } = (await response.json()) as {
      note: { title: string };
      editor: string | null;
    };
    setStatus(`Renamed to ${note.title} by ${editor ?? "a guest"}`);
    router.refresh();
  }

  return (
    <form action={rename}>
      <label>
        New title <input name="title" />
      </label>
      <button>Rename</button>
      <output>{status}</output>
    </form>
  );
}
