import type { ReactNode } from "react";

export default function ParallelLayout({
  children,
  slot,
}: {
  children: ReactNode;
  slot: ReactNode;
}) {
  return (
    <section>
      <div data-testid="parallel-children">{children}</div>
      <aside data-testid="parallel-slot">{slot}</aside>
    </section>
  );
}
