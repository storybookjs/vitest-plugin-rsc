import type { ReactNode } from "react";
import "./layout.css";

// A layout with CSS of its own.
export default function StylesLayout({ children }: { children: ReactNode }) {
  return <section className="styles-layout">{children}</section>;
}
