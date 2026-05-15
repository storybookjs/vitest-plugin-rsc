import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer uses a private fake route without rendering a document when no URL is provided", async () => {
  const { container } = await renderServer(
    <main data-testid="notes-direct-fake-route">Notes direct fake route</main>,
  );

  await expect.element(page.getByTestId("notes-direct-fake-route")).toBeVisible();
  expect(container.querySelector("html")).toBeNull();
  expect(container.querySelector("body")).toBeNull();
});
