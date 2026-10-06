import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Notes", template: "%s | Notes" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Main">
          <Link href="/">Home</Link> <Link href="/notes">Notes</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
