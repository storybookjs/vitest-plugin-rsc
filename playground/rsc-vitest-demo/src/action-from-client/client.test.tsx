import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { TestActionFromClient, TestUseActionState } from "./client.tsx";

test("test use action state", async () => {
  await renderServer(<TestUseActionState />);

  await expect
    .element(page.getByTestId("use-action-state"))
    .toHaveTextContent("test-useActionState: 0");

  await page.getByTestId("use-action-state").click();

  await expect
    .element(page.getByTestId("use-action-state"))
    .toHaveTextContent("test-useActionState: 1");

  await page.getByTestId("use-action-state").click();

  await expect
    .element(page.getByTestId("use-action-state"))
    .toHaveTextContent("test-useActionState: 2");
});

test("test use action state", async () => {
  vi.spyOn(console, "log");

  await renderServer(<TestActionFromClient />);

  await page.getByRole("button", { name: /test-action-from-client$/ }).click();

  await vi.waitFor(() => {
    expect(console.log).toBeCalledWith("[test-action-from-client]");
  });

  await page.getByRole("button", { name: /test-action-from-client-2$/ }).click();

  await vi.waitFor(() => {
    expect(console.log).toBeCalledWith("[test-action-from-client-2]");
  });
});
