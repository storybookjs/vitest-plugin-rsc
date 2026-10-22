// Experiment L: a recipe for a user whose library leaves a timer that fires
// after its page is left, like next-themes. Vitest's fake timers for
// `setTimeout` and `Date`, which still advance with the clock, and the
// pending ones run before the plugin leaves the page. The same cases as F
// and J, which threw without it: see notes-recipe-control/.
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { NextRouterProbe } from "../../../../playground/nextjs-notes-demo/components/next-router-probe.tsx";
import { signedInAs } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

// The recipe.
beforeEach(() => {
  // With `Date`: else the fake timers would undo the clock that the notes
  // demo's setup file fixes with `vi.setSystemTime()`.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setTimerTickMode("nextTimerAsync");
  const fake = globalThis.setTimeout;
  const seen = new Map<string, number>();
  (globalThis as any).__seen = seen;
  globalThis.setTimeout = ((fn: any, ms?: number, ...rest: any[]) => {
    const frame = (new Error().stack ?? "")
      .split("\n")
      .slice(2, 4)
      .join(" | ")
      .replace(/\s+/g, " ");
    const key = `${ms ?? 0} ${frame}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (typeof fn === "function") {
      const inner = fn;
      fn = (...args: any[]) => {
        const t0 = performance.now();
        try {
          return inner(...args);
        } finally {
          if ((globalThis as any).__trace)
            console.log(
              "PLM " +
                JSON.stringify({
                  at: Math.round(t0 - (globalThis as any).__trace),
                  ran: Math.round(performance.now() - t0),
                  ms,
                  frame: frame.slice(0, 160),
                }),
            );
        }
      };
    }
    return fake(fn, ms, ...rest);
  }) as any;
});
// Before the plugin's own `afterEach`, which leaves the page: Vitest runs
// the `afterEach` hooks of a test file before those of the setup files.
afterEach(async () => {
  try {
    if (vi.isFakeTimers()) {
      await vi.runOnlyPendingTimersAsync();
    }
  } finally {
    const seen = (globalThis as any).__seen as Map<string, number>;
    console.log("PLM " + JSON.stringify([...seen].sort((a, b) => b[1] - a[1]).slice(0, 8)));
    vi.useRealTimers();
  }
});

test("a link to a route of the app loads its page", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/123" });
  await page.getByRole("link", { name: "Link route" }).click();
  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }))
    .toBeVisible();
});

test("pages back to back, with the timers run before each next page", async () => {
  await signedInAs();
  for (let index = 0; index < 10; index++) {
    const t0 = performance.now();
    await renderServer({ url: "/notes" });
    console.log("PLM " + JSON.stringify({ loadMs: Math.round(performance.now() - t0) }));
    const t1 = performance.now();
    (globalThis as any).__trace = index === 3 ? t1 : 0;
    await vi.runOnlyPendingTimersAsync();
    (globalThis as any).__trace = 0;
    console.log("PLM " + JSON.stringify({ runPendingMs: Math.round(performance.now() - t1) }));
  }
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
});

test("a later test that does nothing wrong", async () => {
  await renderServer({ url: "/" });
  expect(document.title).not.toBe("");
});
