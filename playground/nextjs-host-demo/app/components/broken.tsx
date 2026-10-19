"use client";

// A Client Component whose file fails as it loads in the browser layer, as
// one with a bug at the top of the file does: see host/references.tsx.
if (typeof window !== "undefined") throw new Error("broken.tsx fails as it loads");

export function Broken() {
  return <span data-testid="broken">never</span>;
}
