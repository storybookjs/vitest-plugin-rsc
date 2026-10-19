"use client";

import { act, use } from "react";
import { createRoot } from "react-dom/client";

// React's own `act()` and `use()`, without the plugin: a root that suspends
// at its shell on a promise that settles later, rendered inside an awaited
// `act()`. With the React that Next comes with, `act()` resolves before the
// root commits: it holds its scope for one task, not until the promise
// settles. That is why the plugin holds it until a client reference has
// loaded (act-hold.ts). Should a React wait itself, test/references.test.ts
// says so, and the hold can go.

const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

/** Whether the root had committed once `act()` resolved. */
export async function committedWhenActResolves(container: Element): Promise<boolean> {
  const loaded = new Promise<string>((resolve) => setTimeout(() => resolve("loaded"), 100));
  function Loads() {
    return <span data-testid="canary">{use(loaded)}</span>;
  }
  const root = createRoot(container);
  const previous = scope.IS_REACT_ACT_ENVIRONMENT;
  scope.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => root.render(<Loads />));
    return container.querySelector("[data-testid=canary]") !== null;
  } finally {
    await act(async () => root.unmount());
    scope.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}
