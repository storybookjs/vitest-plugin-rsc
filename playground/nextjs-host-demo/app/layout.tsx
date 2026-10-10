import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { geist } from "./fonts/fonts.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Host demo", template: "%s | Host demo" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <nav aria-label="Main">
          <Link href="/">Home</Link> <Link href="/notes/7">Note 7</Link>{" "}
          <Link href="/slow">Slow</Link> <Link href="/settings">Settings</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
