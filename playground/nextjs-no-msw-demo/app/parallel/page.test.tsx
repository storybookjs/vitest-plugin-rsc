import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a Next app route with a parallel slot", async () => {
  await renderServer({ url: "/parallel" });

  await expect.element(page.getByTestId("parallel-children")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Parallel children" })).toBeVisible();
  await expect.element(page.getByTestId("parallel-slot")).toBeVisible();
  await expect.element(page.getByText("Parallel slot")).toBeVisible();
});

test("renderServer replaces only the matched page in a parallel route", async () => {
  await renderServer(<h1>Replacement child content</h1>, { url: "/parallel" });

  await expect.element(page.getByTestId("parallel-children")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Replacement child content" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Parallel children" }))
    .not.toBeInTheDocument();
  await expect.element(page.getByTestId("parallel-slot")).toBeVisible();
  await expect.element(page.getByText("Parallel slot")).toBeVisible();
});
