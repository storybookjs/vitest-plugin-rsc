"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The theme is in the browser's storage, which the server cannot read. So
  // the button names it once the page has hydrated, not in the server's HTML.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Theme: {hydrated ? theme : "…"}
    </button>
  );
}
