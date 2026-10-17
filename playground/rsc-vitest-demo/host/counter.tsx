"use client";

import { useState, useTransition } from "react";
import "./counter.css";
import { double } from "./counter-actions.ts";

// A Client Component with state and its own CSS, which calls a Server Action
// that no Server Component imports: the build finds it from here.
export function Counter() {
  const [count, setCount] = useState(0);
  const [pending, startTransition] = useTransition();
  return (
    <section className="counter">
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => setCount(await double(count)))}
      >
        Double on the server
      </button>
    </section>
  );
}
