import type { ReactNode } from "react";
import "./callout.css";

// A Server Component with global CSS, which styles every heading of the page
// it is on: a story of another component does not have it.
export function Callout({ children }: { children: ReactNode }) {
  return (
    <aside className="callout">
      <h2>{children}</h2>
    </aside>
  );
}
