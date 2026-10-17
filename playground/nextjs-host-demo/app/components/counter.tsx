"use client";

import { useState } from "react";
import styles from "./counter.module.css";

// A Client Component with a CSS module: a stylesheet of a page, of a node,
// and of a file of the host with `"use client"` that renders it.
export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button className={styles.counter} onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
