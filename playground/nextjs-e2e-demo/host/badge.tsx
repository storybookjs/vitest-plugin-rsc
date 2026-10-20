"use client";

import { useEffect, useState } from "react";

// A Client Component of the host that a node of the host renders: the ssr
// layer renders it into the HTML of the page, and the browser layer hydrates
// it, as a Client Component of the app. So the ssr layer of a build lists it:
// see build-test/static-build.test.ts.
export function HostBadge() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return <p data-hydrated={hydrated}>A Client Component of the host</p>;
}
