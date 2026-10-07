"use client";

import localFont from "next/font/local";

// A font that only a Client Component has: no module of the server calls it.
const display = localFont({ src: "./geist-latin.woff2", display: "block" });

export function ClientFont() {
  return <p className={display.className}>Set in a font of a Client Component</p>;
}
