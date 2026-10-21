"use client";

import { useEffect } from "react";

declare global {
  var lateTimers: string[] | undefined;
}

// Starts a timer and an interval that fire after the test has left the page,
// well after, also on a slow machine, and an animation frame once the test
// asks, also after that: as the code of an app may, like next-themes, which
// turns transitions back on with a timer.
export function LateTimers() {
  useEffect(() => {
    const fired: string[] = (globalThis.lateTimers = []);
    setTimeout(() => fired.push("timeout"), 1000);
    setInterval(() => fired.push("interval"), 1000);
    window.addEventListener("late-frame", () => requestAnimationFrame(() => fired.push("frame")), {
      once: true,
    });
  }, []);
  return <p>Late timers</p>;
}
