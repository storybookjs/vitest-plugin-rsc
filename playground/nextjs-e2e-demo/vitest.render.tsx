"use client";

import type { ReactNode } from "react";
import { render } from "vitest-browser-react";

// What renders JSX that a test file without "use client" made, with client
// references in it, in the tab: with the React of the browser layer, as the
// renderer of a framework renders a story under Vitest. A file of the host,
// see `host` in vitest.config.ts: a test file gets its exports with
// `loadClientModule()`. vitest-browser-react's `render()` awaits React's
// `act()`, which waits for the references to load.
export function renderInTab(node: ReactNode) {
  return render(node);
}
