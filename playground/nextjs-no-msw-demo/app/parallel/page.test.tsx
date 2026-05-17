import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

const removedDirectReactNodeRouteApiReason =
  "removed Next direct ReactNode route API; revisit with P2 fake-route fixtures";
const removedNoMswAppPageRouteRuntimeReason =
  "removed non-MSW App Page route runtime; revisit only as P2 legacy no-MSW coverage";

test.skip(`renderServer resolves a Next app route with a parallel slot (${removedNoMswAppPageRouteRuntimeReason})`, async () => {
  await renderServer({ url: "/parallel" });

  await expect.element(page.getByTestId("parallel-children")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Parallel children" })).toBeVisible();
  await expect.element(page.getByTestId("parallel-slot")).toBeVisible();
  await expect.element(page.getByText("Parallel slot")).toBeVisible();
});

test.skip(`renderServer replaces only the matched page in a parallel route (${removedDirectReactNodeRouteApiReason})`, async () => {
  await renderServer({ url: "/parallel" });

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
