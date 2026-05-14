import type { ReactNode } from "react";

export default async function TeamRoutePatternLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ team: string }>;
}) {
  const { team } = await params;

  return (
    <section aria-label={`notes team layout ${team}`}>
      <span data-testid="notes-team-layout-param">{team}</span>
      {children}
    </section>
  );
}
