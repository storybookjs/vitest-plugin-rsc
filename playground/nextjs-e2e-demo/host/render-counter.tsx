"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Counter } from "../app/components/counter.tsx";

// Renders a Client Component of the app in the host's document, as the
// renderer of a framework does: with the browser layer's React, the one of
// the component. It has rendered when this returns.
export function renderCounter(container: Element): void {
  const root = createRoot(container);
  flushSync(() => root.render(<Counter />));
}
