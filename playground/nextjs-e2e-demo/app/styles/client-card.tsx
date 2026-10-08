"use client";

// A module of its own: no Server Component brings its CSS.
import styles from "./client-card.module.css";

export function ClientCard() {
  return <p className={styles.card}>Styled by a CSS module in a Client Component</p>;
}
