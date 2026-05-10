import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { TestServerActionError } from "./server.tsx";

test("client error boundary catches server errors", async () => {
  await renderServer(<TestServerActionError />);
  await page.getByRole("button", { name: "test-server-action-error" }).click();
  await expect.element(page.getByText(/ErrorBoundary caught/)).toBeVisible();
  await page.getByRole("button", { name: "reset-error" }).click();
  await expect
    .element(page.getByRole("button", { name: "test-server-action-error" }))
    .toBeVisible();
});
