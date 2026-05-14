import type { ReactNode } from "react";

export default function DefaultedRoutePatternLayout({
  children,
  slot,
}: {
  children: ReactNode;
  slot: ReactNode;
}) {
  return (
    <section>
      <div data-testid="notes-defaulted-children">{children}</div>
      <aside data-testid="notes-defaulted-slot">{slot}</aside>
    </section>
  );
}
