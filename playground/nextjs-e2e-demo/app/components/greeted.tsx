"use client";

import { useEffect } from "react";

declare global {
  var greeted: string | undefined;
}

// Says whom the page greeted last, from a passive effect.
export function Greeted({ name }: { name: string }) {
  useEffect(() => {
    globalThis.greeted = name;
  }, [name]);
  return null;
}
