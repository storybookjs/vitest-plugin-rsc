import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Host demo", template: "%s | Host demo" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Main">
          <Link href="/">Home</Link> <Link href="/notes/7">Note 7</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
