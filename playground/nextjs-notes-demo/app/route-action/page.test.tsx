import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { resetRouteActionState } from "./page.tsx";

test("route actions are handled through the generated Edge App Page route", async () => {
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

  await vi.waitFor(() => {
    expect(window.location.pathname).toBe("/route-patterns/conventions");
    expect(window.location.search).toBe("?from=route-action");
  });
  await expect.element(page.getByRole("heading", { name: "Route conventions" })).toBeVisible();
  await expect
    .element(page.getByText("The conventions page rendered through the Next app route tree."))
    .toBeVisible();
  await expect.element(page.getByText("Redirect source: route-action")).toBeVisible();
});
