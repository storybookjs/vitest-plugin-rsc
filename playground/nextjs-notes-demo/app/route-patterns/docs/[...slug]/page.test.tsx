import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a catch-all route in notes demo", async () => {
  await renderServer({ url: "/route-patterns/docs/guides/rsc" });

  await expect.element(page.getByTestId("notes-route-patterns-layout")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes docs: guides/rsc" })).toBeVisible();
});
