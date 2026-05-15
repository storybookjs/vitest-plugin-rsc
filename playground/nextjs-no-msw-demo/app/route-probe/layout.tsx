import type { ReactNode } from "react";

export default function RouteProbeLayout({ children }: { children: ReactNode }) {
  return <section aria-label="route probe layout">{children}</section>;
}
