"use client";

// Next's own global error page, whose client code waits in the browser while a
// test holds it. Next creates the root of a page once this module is there.
const held = globalThis as {
  globalError?: { loading: boolean; loaded: boolean; release: Promise<void> };
};
const holding = typeof window === "undefined" ? undefined : held.globalError;
if (holding) {
  holding.loading = true;
  await holding.release;
  holding.loaded = true;
}

export { default } from "next/dist/client/components/builtin/global-error";
