import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LayoutSegmentProbe } from "./layout-segment-probe.tsx";

export const metadata: Metadata = {
  title: "Selected layout metadata",
  description: "Metadata exported by a nested route layout.",
};

export default function SelectedLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <LayoutSegmentProbe />
      {children}
    </section>
  );
}
