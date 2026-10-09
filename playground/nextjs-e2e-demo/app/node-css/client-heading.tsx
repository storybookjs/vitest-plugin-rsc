"use client";

import type { ReactNode } from "react";
import "./client-heading.css";

// A Client Component with global CSS, which styles every `<h3>` of its page.
export function ClientHeading({ children }: { children: ReactNode }) {
  return <h3>{children}</h3>;
}
