import type { ReactNode } from "react";

// A layout with two slots. `/prerendered/slots/other` is a page of `side`
// only. On a page load, `top` renders its `default.tsx`, which calls
// `notFound()`: the render of that path is a 404, which `next build` keeps
// without its status. A navigation keeps what `top` shows.
export default function SlotsLayout({
  children,
  side,
  top,
}: {
  children: ReactNode;
  side: ReactNode;
  top: ReactNode;
}) {
  return (
    <>
      <header>{top}</header>
      {children}
      <aside>{side}</aside>
    </>
  );
}
