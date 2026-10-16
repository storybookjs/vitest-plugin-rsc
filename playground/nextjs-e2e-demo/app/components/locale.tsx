"use client";

import { getLocale } from "../lib/locale.ts";

// Shows what the setup of the browser layer set: see test/setup-locale.tsx.
export function Locale() {
  return <p>Locale: {getLocale()}</p>;
}
