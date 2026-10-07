"use client";

import { geist } from "./fonts.ts";

// Renders what the font function returned, on the server and in the browser.
export function FontName() {
  return <p className={geist.className}>Client Component in {geist.style.fontFamily}</p>;
}
