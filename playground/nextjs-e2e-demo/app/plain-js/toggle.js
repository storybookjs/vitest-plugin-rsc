"use client";

import { useState } from "react";

// A Client Component with JSX in a `.js` file.
export function PlainToggle() {
  const [on, setOn] = useState(false);
  return <button onClick={() => setOn(!on)}>Plain toggle: {on ? "on" : "off"}</button>;
}
