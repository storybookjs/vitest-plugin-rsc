import type { ReactNode } from "react";

export default function RoutePatternTemplate({ children }: { children: ReactNode }) {
  return <section data-testid="notes-route-patterns-template">{children}</section>;
}
