"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

export default function BrokenError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <>
      <h1>Something went wrong</h1>
      <button
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      >
        Try again
      </button>
    </>
  );
}
