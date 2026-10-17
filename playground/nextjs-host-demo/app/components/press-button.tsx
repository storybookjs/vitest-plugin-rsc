"use client";

import { useState } from "react";
import styles from "./press-button.module.css";
import { useTheme } from "./theme.tsx";

// A Client Component that gets only its props, one of them a function: a
// component for a story of a file with "use client".
export function PressButton({ label, onPress }: { label: string; onPress: () => void }) {
  const [presses, setPresses] = useState(0);
  return (
    <button
      className={styles.button}
      data-theme={useTheme()}
      onClick={() => {
        setPresses(presses + 1);
        onPress();
      }}
    >
      {label}: {presses}
    </button>
  );
}
