import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";

import { CjsClientBoundaryServer } from "./server.tsx";

test("hydrates a use-client module required by a CommonJS server dependency", async () => {
  await renderServer(<CjsClientBoundaryServer />);

  await expect
    .element(page.getByRole("heading", { name: "CommonJS client boundary" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Server rendered through a CommonJS dependency."))
    .toBeVisible();

  const button = page.getByRole("button", { name: "CJS client count: 0" });
  await expect.element(button).toBeVisible();

  await button.click();
  await expect.element(page.getByRole("button", { name: "CJS client count: 1" })).toBeVisible();
});
