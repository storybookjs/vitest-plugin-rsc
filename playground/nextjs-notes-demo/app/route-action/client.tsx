"use client";

import { useState, useTransition } from "react";

export function RouteActionClient({
  increment,
  redirectToConventions,
}: {
  increment: () => Promise<number>;
  redirectToConventions: () => Promise<void>;
}) {
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
      <button
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await redirectToConventions();
          });
        }}
      >
        Redirect route action
      </button>
    </>
  );
}
