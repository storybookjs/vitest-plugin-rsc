import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves an optional catch-all route without params in notes demo", async () => {
  await renderServer({ url: "/route-patterns/archive" });

  await expect.element(page.getByTestId("notes-route-patterns-layout")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes archive: index" })).toBeVisible();
});
