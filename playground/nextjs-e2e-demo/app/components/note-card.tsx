import type { ReactNode } from "react";
import styles from "./note-card.module.css";

// A Server Component of the app that only the host renders, in its node: its
// CSS is that of the file of the host that imports it, host/node.tsx.
export function NoteCard({ children }: { children: ReactNode }) {
  return <p className={styles.card}>{children}</p>;
}
