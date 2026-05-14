"use client";

import { useState, useTransition } from "react";

export function RouteActionClient({ increment }: { increment: () => Promise<number> }) {
  const [count, setCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <p>server count: {count}</p>
      <button
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setCount(await increment());
          });
        }}
      >
        Increment route action
      </button>
    </>
  );
}
