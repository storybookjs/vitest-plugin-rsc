"use client";

import { toggleFavorite } from "../lib/actions.ts";

// Calls its Server Action and does not wait for it, as an event handler
// may: app/leave.test.tsx.
export function StarButton({ id }: { id: string }) {
  return <button onClick={() => void toggleFavorite(id)}>Star</button>;
}
