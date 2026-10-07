"use client";

import { useEffect, useState } from "react";

// Next renders a Client Component twice: to HTML on the server, then in the
// browser.
const here = () => (typeof window === "undefined" ? "server" : "browser");

export function RenderedIn() {
  const [now, setNow] = useState<string>();
  useEffect(() => setNow(here()), []);
  return (
    <p>
      {/* The HTML says where it was made. React leaves it as it is when it hydrates. */}
      Client Component: first rendered on the <span suppressHydrationWarning>{here()}</span>
      {now && `, now running in the ${now}`}
    </p>
  );
}
