import type { ReactNode } from "react";
import styles from "./callout.module.css";

// A Server Component with CSS of its own, which only a file of the host that
// renders it brings to a page: see host/callout.tsx.
export function Callout({ children }: { children: ReactNode }) {
  return (
    <aside className={styles.callout} data-testid="callout">
      {children}
    </aside>
  );
}
