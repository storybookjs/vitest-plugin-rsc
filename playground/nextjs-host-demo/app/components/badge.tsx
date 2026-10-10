"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import logo from "../logo.png";
import styles from "./badge.module.css";
import dot from "./dot.svg?no-inline";

// A Client Component with a CSS module and an image of its own, and a file
// that Vite gives the URL of, which the server renders too: in a build a file
// of its own, also when it is small.
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className={styles.badge} data-testid="badge">
      <Image src={logo} alt="Badge logo" width={16} height={12} />
      <img src={dot} alt="Badge dot" width={8} height={8} />
      {children}
    </span>
  );
}
