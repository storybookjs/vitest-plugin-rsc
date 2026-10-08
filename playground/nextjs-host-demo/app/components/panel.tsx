"use client";

import styles from "./panel.module.css";

export default function Panel() {
  return (
    <p className={styles.panel} data-testid="panel">
      Panel: loaded in a {typeof window === "undefined" ? "server" : "browser"}
    </p>
  );
}
