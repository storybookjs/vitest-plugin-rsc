import type { ReactNode } from "react";

// A layout of slots only: no `page.tsx` or `default.tsx` is next to it, so
// there is nothing in `children`.
export default function BoardLayout({
  children,
  team,
  activity,
}: {
  children: ReactNode;
  team: ReactNode;
  activity: ReactNode;
}) {
  return (
    <>
      {children}
      <section aria-label="Team">{team}</section>
      <section aria-label="Activity">{activity}</section>
    </>
  );
}
