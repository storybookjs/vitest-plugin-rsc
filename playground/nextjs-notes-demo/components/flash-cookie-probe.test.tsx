import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("headers and cookies follow the documented request API methods", async () => {
  const requestHeaders = new Headers();
  requestHeaders.set("x-test-request", "from-test");
  requestHeaders.set("cookie", "flash=initial");

  await renderServer({
    url: "/flash-cookie-probe",
    headers: requestHeaders,
  });

  await expect.element(page.getByText("request id: from-test")).toBeVisible();
  await expect.element(page.getByText("flash: initial")).toBeVisible();
  await expect.element(page.getByText("flash values: initial")).toBeVisible();
  await expect.element(page.getByText("has flash: true")).toBeVisible();
  await expect.element(page.getByText("draft mode: false")).toBeVisible();
});

test.todo("Server Action cookie mutations run through the generated Edge App Page action protocol");
