"use client";

import { useState } from "react";
import preview from "../.storybook/preview.tsx";

// Client stories of the page's storage, which is empty as a story starts,
// as in a new browser context. A story's `beforeEach` writes what it starts
// with, and its render reads it.
const meta = preview.meta({
  args: { label: "Visitor" },
  render: function Visitor({ label }) {
    const read = () => localStorage.getItem("visitor") ?? "none";
    const [visitor, setVisitor] = useState(read);
    return (
      <button type="button" onClick={() => setVisitor(read())}>
        {label}: {visitor}
      </button>
    );
  },
});

// Reads the storage as it renders, and again at a press of its button.
export const Reads = meta.story({});

export const Writes = meta.story({
  beforeEach: () => localStorage.setItem("visitor", "Grace"),
});
