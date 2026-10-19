"use client";

// A Client Component that a Server Component makes the element of only as it
// renders, so nothing can load it before: see host/references.tsx.
export function Late() {
  return <s data-testid="late">late</s>;
}
