import type { ReactNode } from "react";

export default function RoutePatternsLayout({ children }: { children: ReactNode }) {
  return <section data-testid="notes-route-patterns-layout">{children}</section>;
}
