import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

const removedDirectReactNodeRouteApiReason =
  "removed Next direct ReactNode route API; revisit with P2 fake-route fixtures";

test.skip(`renderServer uses a private fake Next route when a ReactNode has no URL (${removedDirectReactNodeRouteApiReason})`, async () => {
  const { container } = await renderServer({ url: "/route-probe" });

  await expect.element(page.getByTestId("direct-fake-route")).toBeVisible();
  await expect.element(page.getByTestId("root-layout")).not.toBeInTheDocument();
  expect(container.querySelector("html")).toBeNull();
  expect(container.querySelector("body")).toBeNull();
});
