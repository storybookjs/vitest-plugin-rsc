import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <main data-testid="root-layout">{children}</main>;
}
