import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

// A Client Component from a package, straight from a Server Component.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <ThemeProvider defaultTheme="light">{children}</ThemeProvider>;
}
