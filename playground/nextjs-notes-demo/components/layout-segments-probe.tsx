"use client";

import { useSelectedLayoutSegment, useSelectedLayoutSegments } from "next/navigation";

export function LayoutSegmentsProbe() {
  const selectedSegment = useSelectedLayoutSegment();
  const selectedSegments = useSelectedLayoutSegments();

  return (
    <section>
      <p>selected segment: {selectedSegment ?? "null"}</p>
      <p>selected segments: {selectedSegments.join(",") || "empty"}</p>
    </section>
  );
}
