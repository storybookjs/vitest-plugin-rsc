"use client";

import { useEffect, useState } from "react";
import { label } from "./speed-features-label.ts";

// For test/speed-features.test.tsx. Which evaluation of this module renders
// the probe: a page load evaluates the modules again, a kept app does not.
const evaluation = Math.random();

const here = () => (typeof window === "undefined" ? "server" : "browser");

export function SpeedFeaturesProbe({ mismatch }: { mismatch: boolean }) {
  // After the hydration: the server has a module of its own.
  const [evaluated, setEvaluated] = useState<number>();
  useEffect(() => setEvaluated(evaluation), []);
  return (
    <main>
      <h1>Speed features</h1>
      <p>Label: {label}</p>
      {/* Another text on the server than in the browser. */}
      {mismatch && <p>Rendered on the {here()}</p>}
      {evaluated !== undefined && <p>Module {evaluated}</p>}
    </main>
  );
}
