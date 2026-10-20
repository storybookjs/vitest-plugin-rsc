"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

// A file of the host with `"use client"` that only the page's own module
// script imports, the host's runtime in example.html, as the runtime of a
// framework imports a file that it shows. No server code renders it, so the
// ssr layer of a build does not list it: see build-test/static-build.test.ts.
export function renderExample(container: Element): void {
  const root = createRoot(container);
  flushSync(() => root.render(<p>An example of the host</p>));
}
