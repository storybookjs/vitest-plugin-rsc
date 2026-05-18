import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { APP_NAME } from "#lib/config.ts";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A database-backed notes app for React Server Components tests.",
};

// Shared app shell: page tests can wrap routes in this without rendering
// RootLayout's <html>/<body> document tags into the Vitest mount node.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 rounded-full border border-border/60 bg-background/70 px-2 py-2 shadow-[0_1px_0_oklch(1_0_0/0.6)_inset,0_8px_24px_-12px_oklch(0.32_0.06_70/0.18)] backdrop-blur-xl dark:bg-background/50">
          <Link
            href="/"
            aria-label={APP_NAME}
            className="group inline-flex items-center gap-2.5 rounded-full pl-1 pr-3 text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-foreground to-foreground/85 text-sm font-semibold text-background shadow-[0_1px_0_oklch(1_0_0/0.18)_inset,0_4px_10px_-4px_oklch(0.32_0.06_70/0.4)] ring-1 ring-foreground/10 transition group-hover:scale-[1.04]"
            >
              N
            </span>
            <span className="hidden text-[0.95rem] tracking-tight sm:inline">{APP_NAME}</span>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
