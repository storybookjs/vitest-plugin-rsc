"use client";

import dynamic from "next/dynamic";

// Rendered on the server too, once it has loaded.
const Legend = dynamic(() => import("./legend.tsx"));

// Not rendered on the server: the HTML has what `loading` returns.
const Chart = dynamic(() => import("./chart.tsx"), {
  ssr: false,
  loading: () => <p>Loading chart…</p>,
});

export function BrowserOnlyChart() {
  return (
    <>
      <Legend />
      <Chart />
    </>
  );
}
