"use client";

// Loads in the browser once a test lets it, and says when it is there: the
// client code of a page that is left before it has hydrated.
const slow = globalThis as {
  slowWidget?: { loading: boolean; loaded: boolean; release?: Promise<void> };
};
const holding = typeof window === "undefined" ? undefined : slow.slowWidget;
if (holding) {
  holding.loading = true;
  await holding.release;
  holding.loaded = true;
}

export function SlowWidget() {
  return <p>Slow widget</p>;
}
