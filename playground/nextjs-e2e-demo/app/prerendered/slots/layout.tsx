import type { ReactNode } from "react";

// A layout with a slot next to its page: `/prerendered/slots/duration` is a
// page of the slot only.
export default function SlotsLayout({
  children,
  views,
}: {
  children: ReactNode;
  views: ReactNode;
}) {
  return (
    <>
      {children}
      <aside aria-label="Views">{views}</aside>
    </>
  );
}
