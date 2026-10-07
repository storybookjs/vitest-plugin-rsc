"use client";

import { useEffect } from "react";

const answer = () => window.dispatchEvent(new Event("shortcuts-answer"));

// Listens on the tab and never stops, as the code of an app may: nothing in a
// browser makes it clean up before the page goes.
export function Shortcuts() {
  useEffect(() => {
    window.addEventListener("shortcuts-ask", answer, { once: true });
  }, []);
  return <p>Shortcuts</p>;
}
