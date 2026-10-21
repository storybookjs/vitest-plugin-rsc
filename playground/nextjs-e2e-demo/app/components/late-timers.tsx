"use client";

import { useEffect } from "react";

declare global {
  var lateTimers: string[] | undefined;
}

// Starts an interval, and a timeout and an animation frame once the test
// asks, also after it has left the page, and cleans none of them up: as the
// code of an app may, like next-themes, which turns transitions back on with
// a timer.
export function LateTimers() {
  useEffect(() => {
    const fired: string[] = (globalThis.lateTimers = []);
    setInterval(() => fired.push("interval"), 20);
    window.addEventListener(
      "late-timers",
      () => {
        setTimeout(() => fired.push("timeout"), 0);
        requestAnimationFrame(() => fired.push("frame"));
      },
      { once: true },
    );
  }, []);
  return <p>Late timers</p>;
}
