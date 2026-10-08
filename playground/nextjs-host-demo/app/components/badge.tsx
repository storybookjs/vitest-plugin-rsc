"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import logo from "../logo.png";
import styles from "./badge.module.css";

// A Client Component with a CSS module and an image of its own.
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className={styles.badge} data-testid="badge">
      <Image src={logo} alt="Badge logo" width={16} height={12} />
      {children}
    </span>
  );
}
