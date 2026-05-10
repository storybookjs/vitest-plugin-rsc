import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { NextRouter, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import FlashCookieProbe from "./flash-cookie-probe";

test("server actions can set cookies for the rerendered server tree", async () => {
  await renderServer(
    <NextRouter url="/flash-cookie-probe">
      <FlashCookieProbe />
    </NextRouter>,
  );

  await expect.element(page.getByText("flash: empty")).toBeVisible();

  await page.getByRole("button", { name: "Set flash" }).click();

  await expect.element(page.getByText("flash: saved")).toBeVisible();
});
