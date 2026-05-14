import type { ReactNode } from "react";
import { LayoutSegmentProbe } from "./layout-segment-probe";

export default function SelectedLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <LayoutSegmentProbe />
      {children}
    </section>
  );
}
