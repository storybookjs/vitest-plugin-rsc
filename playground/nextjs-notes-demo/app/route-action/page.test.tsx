import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  expectToHaveBeenNavigatedTo,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { resetRouteActionState } from "./page";

test("renderServer route actions are handled through Next app-render", async () => {
  resetRouteActionState();

  await renderServer({ url: "/route-action" });

  await expect.element(page.getByRole("heading", { name: "Route action" })).toBeVisible();
  await expect.element(page.getByText("server count: 0")).toBeVisible();

  await page.getByRole("button", { name: "Increment route action" }).click();
  await expect.element(page.getByText("server count: 1")).toBeVisible();
});

test("renderServer route action redirects render the target route", async () => {
  resetRouteActionState();

  await renderServer({ url: "/route-action" });

  await page.getByRole("button", { name: "Redirect route action" }).click();

  await vi.waitFor(() =>
    expectToHaveBeenNavigatedTo({
      pathname: "/route-patterns/conventions",
      search: "?from=route-action",
    }),
  );
  await expect.element(page.getByRole("heading", { name: "Route conventions" })).toBeVisible();
  await expect
    .element(page.getByText("The conventions page rendered through the Next app route tree."))
    .toBeVisible();
  await expect.element(page.getByText("Redirect source: route-action")).toBeVisible();
});
