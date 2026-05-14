import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves page metadata through Next route conventions", async () => {
  await renderServer({ url: "/route-patterns/conventions" });

  await expect.element(page.getByRole("heading", { name: "Route conventions" })).toBeVisible();
  expect(document.title).toBe("Route convention metadata");
});
