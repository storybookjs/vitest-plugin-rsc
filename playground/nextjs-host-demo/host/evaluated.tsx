"use client";

// A file of the host with "use client" whose component says which evaluation
// of the file it is, for a host that imports the file again, as Vite's
// client does after a change: see main.tsx.
export const evaluation = Math.random().toString(36).slice(2);

export function Evaluation() {
  return <span data-testid="evaluation" data-evaluation={evaluation} />;
}
