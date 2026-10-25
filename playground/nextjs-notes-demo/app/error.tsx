"use client";

import { buttonVariants } from "#components/ui/button-variants.ts";

// What a page shows when its render fails: Next sends its document with a 500.
export default function PageError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-4 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <button type="button" onClick={reset} className={buttonVariants({ variant: "outline" })}>
        Try again
      </button>
    </main>
  );
}
