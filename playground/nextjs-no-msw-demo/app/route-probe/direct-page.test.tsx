import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer replaces the matched Next page when a ReactNode has a URL", async () => {
  await renderServer(<h1>Replacement route page</h1>, { url: "/route-probe" });

  await expect.element(page.getByTestId("root-layout")).toBeVisible();
  await expect.element(page.getByLabelText("route probe layout")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Replacement route page" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Route probe" })).not.toBeInTheDocument();
});
