"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// A dialog the way Radix or MUI renders one: in a portal, in `<body>`.
export function HelpDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Help</button>
      {open &&
        createPortal(
          <dialog open aria-label="Help">
            <button onClick={() => setOpen(false)}>Close</button>
          </dialog>,
          document.body,
        )}
    </>
  );
}
