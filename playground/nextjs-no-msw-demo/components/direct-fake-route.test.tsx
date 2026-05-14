import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer uses a private fake Next route when a ReactNode has no URL", async () => {
  const { container } = await renderServer(
    <main data-testid="direct-fake-route">Direct fake route</main>,
  );

  await expect.element(page.getByTestId("direct-fake-route")).toBeVisible();
  await expect.element(page.getByTestId("root-layout")).not.toBeInTheDocument();
  expect(container.querySelector("html")).toBeNull();
  expect(container.querySelector("body")).toBeNull();
});
