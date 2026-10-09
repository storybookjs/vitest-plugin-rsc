import type { ReactNode } from "react";
import "./server-heading.css";

// A Server Component with global CSS, which styles every `<h3>` of its page.
export function ServerHeading({ children }: { children: ReactNode }) {
  return <h3>{children}</h3>;
}
