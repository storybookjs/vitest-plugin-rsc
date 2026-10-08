"use client";

import { useState, type ReactNode } from "react";

// A wrapper that is a Client Component: it has state of its own.
export function ClientFrame({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-label="Frame">
      <button onClick={() => setOpen(!open)}>{open ? "Close" : "Open"}</button>
      {open && children}
    </section>
  );
}
