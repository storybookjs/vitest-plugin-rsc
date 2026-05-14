import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { resetRouteActionState } from "./page";

test("renderServer route actions are handled through Next app-render", async () => {
  resetRouteActionState();

  await renderServer({ url: "/route-action" });

  await expect.element(page.getByRole("heading", { name: "Route action" })).toBeVisible();
  await expect.element(page.getByText("server count: 0")).toBeVisible();

  await page.getByRole("button", { name: "Increment route action" }).click();
  await expect.element(page.getByText("server count: 1")).toBeVisible();
});
