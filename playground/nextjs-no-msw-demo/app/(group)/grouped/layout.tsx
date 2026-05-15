import type { ReactNode } from "react";

export default function GroupedLayout({ children }: { children: ReactNode }) {
  return <section aria-label="grouped layout">{children}</section>;
}
