import type { ReactNode } from "react";

export default function DashboardLayout({
  children,
  stats,
}: {
  children: ReactNode;
  stats: ReactNode;
}) {
  return (
    <>
      {children}
      <aside aria-label="Stats">{stats}</aside>
    </>
  );
}
