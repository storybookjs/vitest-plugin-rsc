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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
});
// Before the plugin's own `afterEach`, which leaves the page: Vitest runs
// the `afterEach` hooks of a test file before those of the setup files.
afterEach(async () => {
  try {
    if (vi.isFakeTimers()) {
      await vi.runOnlyPendingTimersAsync();
    }
  } finally {
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
    await renderServer({ url: "/notes" });
    await vi.runOnlyPendingTimersAsync();
  }
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
});

test("a later test that does nothing wrong", async () => {
  await renderServer({ url: "/" });
  expect(document.title).not.toBe("");
});
