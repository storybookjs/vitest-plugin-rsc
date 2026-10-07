import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { signInAs, whereAmI } from "../test/browser.ts";
import { requestHits } from "../test/service.ts";

// The app's server code runs in this tab, compiled as server code: `typeof
// window` is "undefined", and `fetch`, `Request` and `Response` are a server's.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

test("renders a Client Component without a window on the server, and with one in the browser", async () => {
  const response = await handleRequest("/environment");
  const html = await response.text();
  expect(html).toContain("first rendered on the <span>server</span>");
  expect(html).not.toContain("now running");

  await renderServer({ url: "/environment" });

  await expect.element(page.getByText(/now running in the browser/)).toBeVisible();
});

test("tells a Server Component that it has no window", async () => {
  await renderServer({ url: "/environment" });

  await expect
    .element(page.getByText("Server Component: typeof window is undefined"))
    .toBeVisible();
});

test("tells a package of the app that it is on the server", async () => {
  await renderServer({ url: "/environment" });

  // @t3-oss/env-core refuses to hand out a server variable in a browser.
  await expect.element(page.getByText("Server variable: hello from the server")).toBeVisible();
});

test("leaves the tab to a test file", () => {
  expect(typeof window).toBe("object");
  expect(typeof document).toBe("object");
  expect(window.location.origin).toBe(new URL(import.meta.url).origin);
  // The tab's Response, which drops the header a server's keeps.
  const response = new Response(null, { headers: { "set-cookie": "session=ada" } });
  expect(response.headers.getSetCookie()).toEqual([]);
});

test("leaves the tab to a module that the config lists in browserModules", async () => {
  expect(whereAmI()).toBe("browser");
  signInAs("grace");

  await renderServer({ url: "/account" });

  await expect.element(page.getByText("Signed in as grace")).toBeVisible();
});

test("sends the fetch of a Server Component through Next: two calls in a render are one request", async () => {
  const key = crypto.randomUUID();

  await renderServer({ url: `/hits?key=${key}` });

  // Both calls got the answer to the first request.
  await expect.element(page.getByText("Hits: 1 and 1")).toBeVisible();
  // And it was the only one: this is the second.
  expect(await requestHits(key)).toBe(2);
});

test("gives a Server Action the Response of a server, which keeps Set-Cookie", async () => {
  await renderServer({ url: "/account" });
  await expect.element(page.getByText("Signed out")).toBeVisible();

  await page.getByRole("button", { name: "Sign in as ada" }).click();

  await expect.element(page.getByText("Signed in as ada")).toBeVisible();
  expect(document.cookie).toBe("session=ada");
});
