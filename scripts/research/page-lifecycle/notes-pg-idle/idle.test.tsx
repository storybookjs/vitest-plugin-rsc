// Whether PGlite's timer spins under the notes demo's fixed clock, with real
// timers: a page load, then 12 s idle, counting the timers PGlite sets.
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { signedInAs } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

test("idle after a page load", { timeout: 30_000 }, async () => {
  const real = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.setTimeout = ((fn: any, ms?: number, ...rest: any[]) => {
    if ((new Error().stack ?? "").includes("__setitimer_js")) delays.push(ms ?? 0);
    return real(fn, ms, ...rest);
  }) as any;
  try {
    await signedInAs();
    await renderServer({ url: "/notes" });
    const before = delays.length;
    await new Promise((resolve) => real(resolve, 12_000));
    console.log(
      "PLM " +
        JSON.stringify({
          before,
          after: delays.length,
          first: delays.slice(0, 3),
          last: delays.slice(-3),
        }),
    );
  } finally {
    globalThis.setTimeout = real;
  }
  expect(true).toBe(true);
});
