// A package that calls `next/font/local` itself.
import { GeistMono } from "geist/font/mono";
import { ClientFont } from "./client-font.tsx";
import { FontName } from "./font-name.tsx";
import { geist, inter } from "./fonts.ts";

export default function FontsPage() {
  return (
    <div className={`${inter.variable} ${geist.variable}`}>
      <h1>Fonts</h1>
      <p className={inter.className}>Set in Inter</p>
      <p className={geist.className}>Set in Geist</p>
      <p style={{ fontFamily: "var(--font-geist)" }}>Set in Geist through its variable</p>
      <p className={GeistMono.className}>Set in the font of a package</p>
      <FontName />
      <ClientFont />
    </div>
  );
}
