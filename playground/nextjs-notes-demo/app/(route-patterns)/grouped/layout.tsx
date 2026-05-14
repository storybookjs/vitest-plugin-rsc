import type { ReactNode } from "react";

export default function GroupedRoutePatternLayout({ children }: { children: ReactNode }) {
  return <section aria-label="notes grouped route layout">{children}</section>;
}
