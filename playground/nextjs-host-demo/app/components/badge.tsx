"use client";

import { useState } from "react";
import styles from "./badge.module.css";

// A Client Component with a CSS module that gets only its props, like one of
// a design system: what a file of the host with `"use client"` exports.
export function Badge() {
  const [clicks, setClicks] = useState(0);
  return (
    <button className={styles.badge} onClick={() => setClicks(clicks + 1)}>
      Clicks: {clicks}
    </button>
  );
}
