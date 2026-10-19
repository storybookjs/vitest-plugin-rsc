"use client";

import { useState } from "react";

// A Client Component that only the host's second render has: nothing loaded
// it before, see host/references.tsx.
export function Added() {
  const [text] = useState("added");
  return <b data-testid="added">{text}</b>;
}
