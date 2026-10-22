// Experiment F: what a user sees when a timer of a page that was left fires
// in the next one. The notes app's next-themes removes a style 1 ms after
// it mounts (`disableTransitionOnChange`). The notes suite waits for that
// with `watchPageLoad()`; this file does not.
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { NextRouterProbe } from "../../../../playground/nextjs-notes-demo/components/next-router-probe.tsx";

test("a link to a route of the app loads its page", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/123" });

  await page.getByRole("link", { name: "Link route" }).click();

  // The page that the app loads itself: the test ends as it shows.
  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }))
    .toBeVisible();
});

test("a later test that does nothing wrong", async () => {
  await renderServer({ url: "/" });
  expect(document.title).not.toBe("");
});
