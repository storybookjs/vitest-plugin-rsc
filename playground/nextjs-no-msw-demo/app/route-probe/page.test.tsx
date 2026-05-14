import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a Next app route by URL", async () => {
  await renderServer({ url: "/route-probe" });

  await expect.element(page.getByTestId("root-layout")).toBeVisible();
  await expect.element(page.getByLabelText("route probe layout")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Route probe" })).toBeVisible();
});
