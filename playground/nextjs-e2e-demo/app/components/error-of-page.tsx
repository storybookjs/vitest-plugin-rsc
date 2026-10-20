"use client";

declare global {
  var errorOfPage: Error | undefined;
}

// An error that a module of the page makes as it loads, as React DOM makes
// the one it throws to suspend: its stack has the frames that loaded the
// module. See memory.test.tsx.
globalThis.errorOfPage = new Error("Made as the page loaded");

export function ErrorOfPage() {
  return <p>Error of the page</p>;
}
