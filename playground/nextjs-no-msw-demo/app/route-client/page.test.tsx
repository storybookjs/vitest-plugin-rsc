import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a Next app route with a client component", async () => {
  await renderServer({ url: "/route-client" });

  await expect.element(page.getByRole("heading", { name: "Route client" })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "client count: 0" })).toBeVisible();
  await page.getByRole("button", { name: "client count: 0" }).click();
  await expect.element(page.getByRole("button", { name: /client count: [1-9]/ })).toBeVisible();
});
