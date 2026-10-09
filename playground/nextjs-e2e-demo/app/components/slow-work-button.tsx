"use client";

import { workSlowly } from "../lib/slow-work-action.ts";

// Calls the Server Action of `/slow-work` from a node of the browser layer.
export function SlowWorkButton() {
  return <button onClick={() => void workSlowly()}>Work slowly</button>;
}
