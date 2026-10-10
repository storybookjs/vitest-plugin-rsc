"use client";

import { useState } from "react";

// Asks a route handler of the app, with the `fetch` of the page.
export function NoteTitles() {
  const [titles, setTitles] = useState<string[]>();
  async function load() {
    const response = await fetch("/api/notes");
    setTitles(((await response.json()) as { titles: string[] }).titles);
  }
  return (
    <p>
      <button onClick={load}>Load notes</button>
      {titles && <output> Notes: {titles.join(", ") || "none"}</output>}
    </p>
  );
}
