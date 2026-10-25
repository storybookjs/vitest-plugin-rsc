import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// The responses of a route handler without a body, which the page gets once
// their head is there, as a browser gets them of `next start`.

test.for([302, 307])("a fetch of the page follows a %i redirect without a body", async (status) => {
  await renderServer({ url: "/" });

  const response = await fetch(`/api/without-body/redirect?status=${status}`);

  expect(response.redirected).toBe(true);
  expect(new URL(response.url).pathname).toBe("/");
  expect(response.status).toBe(200);
});

test.for([204, 304, 200])("a fetch of the page gets a %i without a body", async (status) => {
  await renderServer({ url: "/" });

  const response = await fetch(`/api/without-body/empty?status=${status}`);

  expect(response.status).toBe(status);
  expect(response.headers.get("x-empty")).toBe("yes");
  expect(await response.text()).toBe("");
});

test("opens the page that a redirect without a body goes to", async () => {
  const { response } = await renderServer({ url: "/api/without-body/redirect" });

  expect(response.redirected).toBe(true);
  expect(window.location.pathname).toBe("/");
  await expect.element(page.getByRole("link", { name: "support@notes.example" })).toBeVisible();
});
