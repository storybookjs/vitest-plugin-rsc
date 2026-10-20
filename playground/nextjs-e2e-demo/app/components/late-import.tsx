"use client";

import { useEffect } from "react";

declare global {
  var lateImport: "loaded" | "failed" | undefined;
}

// Imports a module once the test asks, also after its page has been left: as
// the code of an app may, from a listener that nothing removes.
export function LateImport() {
  useEffect(() => {
    const load = () =>
      import("./late-module.ts").then(
        () => (globalThis.lateImport = "loaded"),
        () => (globalThis.lateImport = "failed"),
      );
    window.addEventListener("late-import", load, { once: true });
  }, []);
  return <p>Late import</p>;
}
