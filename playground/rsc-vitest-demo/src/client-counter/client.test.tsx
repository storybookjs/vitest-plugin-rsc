import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";

import { ClientCounter } from "./client.tsx";

test("client counter", async () => {
  await renderServer(<ClientCounter />);
  await page.getByRole("button", { name: "client-counter: 0" }).click();
  await page.getByRole("button", { name: "client-counter: 1" }).click();
  await expect.element(page.getByRole("button", { name: "client-counter: 2" })).toBeVisible();
});
