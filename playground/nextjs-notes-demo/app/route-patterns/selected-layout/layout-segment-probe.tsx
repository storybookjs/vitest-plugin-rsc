"use client";

import { useSelectedLayoutSegment, useSelectedLayoutSegments } from "next/navigation";

export function LayoutSegmentProbe() {
  const selectedSegment = useSelectedLayoutSegment();
  const selectedSegments = useSelectedLayoutSegments();

  return (
    <section aria-label="selected layout probe">
      <p>layout selected segment: {selectedSegment ?? "null"}</p>
      <p>layout selected segments: {selectedSegments.join(",") || "empty"}</p>
    </section>
  );
}
