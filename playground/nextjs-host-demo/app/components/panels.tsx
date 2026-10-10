"use client";

import dynamic from "next/dynamic";

// Not rendered on the server: its code and its CSS load in the browser.
const Panel = dynamic(() => import("./panel.tsx"), {
  ssr: false,
  loading: () => <p>Loading panel…</p>,
});

export function Panels() {
  return <Panel />;
}
