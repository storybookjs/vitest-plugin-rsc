import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { TestActionStateServer } from "./server.tsx";

test("use action state with jsx", async () => {
  await renderServer(<TestActionStateServer />);

  await page.getByRole("button").click();

  await expect.element(page.getByTestId("use-action-state-jsx")).toHaveTextContent(/\(ok\)/);

  await page.getByRole("button").click();

  await expect
    .element(page.getByTestId("use-action-state-jsx"))
    .toHaveTextContent(/\(ok\).*\(ok\)/);
});
