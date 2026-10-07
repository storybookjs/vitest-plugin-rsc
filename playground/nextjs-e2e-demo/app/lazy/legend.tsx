"use client";

import { useState } from "react";

export default function Legend() {
  const [open, setOpen] = useState(false);
  return <button onClick={() => setOpen(!open)}>Legend: {open ? "open" : "closed"}</button>;
}
