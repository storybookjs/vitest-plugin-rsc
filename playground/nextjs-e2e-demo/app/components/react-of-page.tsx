"use client";

import React from "react";

declare global {
  var reactOfPage: object | undefined;
}

// The exports of the page's React: the object that CommonJS interop reads
// them from, which V8 may keep after the page has gone. See memory.test.tsx.
globalThis.reactOfPage = React;

export function ReactOfPage() {
  return <p>React {React.version}</p>;
}
