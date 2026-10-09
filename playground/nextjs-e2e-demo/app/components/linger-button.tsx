"use client";

import { useState, useTransition } from "react";
import { revalidateAndCallLinger } from "../lib/linger-actions.ts";

export function LingerButton() {
  const [result, setResult] = useState("none");
  const [, startTransition] = useTransition();
  return (
    <button onClick={() => startTransition(async () => setResult(await revalidateAndCallLinger()))}>
      Result: {result}
    </button>
  );
}
