"use client";

import { usePathname } from "next/navigation";
import { Counter } from "./counter.tsx";

// A Client Component that shows the pathname of the request, which Next's
// router reads, with a state of its own in the counter.
export function Pathname({ label }: { label: string }) {
  return (
    <section>
      <p>
        {label} at {usePathname()}
      </p>
      <Counter />
    </section>
  );
}
