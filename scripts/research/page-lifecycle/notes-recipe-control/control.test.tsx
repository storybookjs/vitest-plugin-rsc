// Experiment L, the control: the cases of notes-recipe/recipe.test.tsx
// without the recipe. Ten page loads in a row of the notes demo, whose
// next-themes leaves a timer that throws once its page is gone.
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
