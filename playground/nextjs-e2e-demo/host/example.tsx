"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

// A file of the host with `"use client"` that only the page's own module
// script imports, the host's runtime in example.html, as the runtime of a
// framework imports a file that it shows. No server code renders it, so the
// ssr layer of a build does not list it: see build-test/static-build.test.ts.
export function renderExample(container: Element): void {
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <>
        <p>An example of the host</p>
        <AskTheApp />
      </>,
    ),
  );
}

// A Client Component that asks a route handler of the app, as one of the
// app does with `fetch`: the server in front of the app answers it.
function AskTheApp() {
  const [answer, setAnswer] = useState<string>();
  const ask = () =>
    void fetch("/api/plain")
      .then((response) => response.text())
      .then(setAnswer);
  return (
    <button onClick={ask}>{answer === undefined ? "Ask the app" : `The app: ${answer}`}</button>
  );
}
