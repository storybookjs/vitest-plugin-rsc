import type { ReactNode } from "react";
import { LayoutSegmentsProbe } from "#components/layout-segments-probe.tsx";

// `useSelectedLayoutSegment(s)` answer for the layout they are called from, so
// the probe that reads them is here and not in a page.
export default function FixturesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LayoutSegmentsProbe />
      {children}
    </>
  );
}
