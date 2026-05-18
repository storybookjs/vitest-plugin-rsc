"use client";

import { useReportWebVitals } from "next/web-vitals";

declare global {
  interface Window {
    __nextWebVitalsProbe?: string[];
  }
}

export function WebVitalsProbe() {
  useReportWebVitals((metric) => {
    window.__nextWebVitalsProbe ??= [];
    window.__nextWebVitalsProbe.push(metric.name);
  });

  return <p>Web vitals hook ready</p>;
}
