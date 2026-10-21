"use client";

import { currentRequest, handle } from "request-context";

// Enters the store of a package as it renders, as React's renderer for
// Node.js enters its request, and reads it once that has returned. The
// browser renders no request, and keeps the text the server rendered.
export function RequestContext() {
  handle("rendered", () => {});
  return <p suppressHydrationWarning>{`Request: ${currentRequest() ?? "none"}`}</p>;
}
