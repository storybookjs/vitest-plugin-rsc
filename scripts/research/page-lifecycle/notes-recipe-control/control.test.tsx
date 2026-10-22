// Experiment L, the control: the same tests without the recipe.
// Experiment L: a recipe for a user whose library leaves a timer that fires
// after its page is left. Vitest's fake timers for `setTimeout`, which still
// advance with the clock, and 20 s more before the plugin leaves the page.
// The same cases as F and J, which threw without it.
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { NextRouterProbe } from "../../../../playground/nextjs-notes-demo/components/next-router-probe.tsx";
import { signedInAs } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

test("a link to a route of the app loads its page", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/123" });
  await page.getByRole("link", { name: "Link route" }).click();
  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }))
    .toBeVisible();
});

test("pages back to back", async () => {
  await signedInAs();
  for (let index = 0; index < 10; index++) {
    await renderServer({ url: "/notes" });
  }
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
});

test("a later test that does nothing wrong", async () => {
  await renderServer({ url: "/" });
  expect(document.title).not.toBe("");
});
