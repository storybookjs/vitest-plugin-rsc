import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer preserves a route template in notes demo", async () => {
  await renderServer({ url: "/route-patterns/template" });

  await expect.element(page.getByTestId("notes-route-patterns-layout")).toBeVisible();
  await expect.element(page.getByTestId("notes-route-patterns-template")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Notes template route page" }))
    .toBeVisible();
});
