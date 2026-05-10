import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { DirectActionProbe, resetDirectActionProbe } from "./direct-action-probe";

test("default server actions rerender without MSW", async () => {
  resetDirectActionProbe();

  await renderServer(<DirectActionProbe />);

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();
  await expect.element(page.getByText("server count: 1")).toBeVisible();
});

test("default server actions still rerender when refresh is called without MSW", async () => {
  resetDirectActionProbe();

  await renderServer(<DirectActionProbe shouldRefresh />);

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();
  await expect.element(page.getByText("server count: 1")).toBeVisible();
});
