import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import FlashCookieProbe from "./flash-cookie-probe.tsx";

test("headers and cookies follow the documented request API methods", async () => {
  const requestHeaders = new Headers();
  requestHeaders.set("x-test-request", "from-test");
  requestHeaders.set("cookie", "flash=initial");

  await renderServer(<FlashCookieProbe />, {
    url: "/flash-cookie-probe",
    headers: requestHeaders,
  });

  await expect.element(page.getByText("request id: from-test")).toBeVisible();
  await expect.element(page.getByText("flash: initial")).toBeVisible();
  await expect.element(page.getByText("flash values: initial")).toBeVisible();
  await expect.element(page.getByText("has flash: true")).toBeVisible();

  await page.getByRole("button", { name: "Set flash" }).click();

  await expect.element(page.getByText("flash: saved")).toBeVisible();
  await expect.element(page.getByText("flash values: saved")).toBeVisible();

  await page.getByRole("button", { name: "Delete flash" }).click();

  await expect.element(page.getByText("flash: empty")).toBeVisible();
  await expect.element(page.getByText("flash values: empty")).toBeVisible();
});
