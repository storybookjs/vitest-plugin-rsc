import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/next";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { signInAs } from "../test/browser.ts";
import { requestHits } from "../test/service.ts";
import { getReport, reports } from "./lib/reports.ts";

// Next's Data Cache: what `unstable_cache` and a cached `fetch` keep from one
// request to the next, and what makes them forget it.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
  Object.assign(reports, { author: "nobody", duration: 0, written: 0 });
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

const revalidateReports = (query = "") =>
  handleRequest(`/api/reports/revalidate${query}`, { method: "POST" });

test("keeps what unstable_cache computed for the next request", async () => {
  reports.author = "ada";
  await renderServer({ url: "/reports/7" });
  await expect.element(page.getByText("Report 7 by ada, number 1")).toBeVisible();

  reports.author = "grace";
  await renderServer({ url: "/reports/7" });

  await expect.element(page.getByText("Report 7 by ada, number 1")).toBeVisible();
  // The arguments are part of the key.
  await renderServer({ url: "/reports/8" });
  await expect.element(page.getByText("Report 8 by grace, number 2")).toBeVisible();
});

test("shares the cache with a test that calls the cached function itself", async () => {
  expect(await getReport("7")).toBe("Report 7 by nobody, number 1");

  await renderServer({ url: "/reports/7" });

  await expect.element(page.getByText("Report 7 by nobody, number 1")).toBeVisible();
  expect(reports.written).toBe(1);
});

test("renders the rest of the page with the stores of the request while a cached function runs", async () => {
  signInAs("ada");
  reports.duration = 300;

  await renderServer({ url: "/reports/7" });

  // Rendered half way the 300 ms: `cookies()` reads the request there.
  await expect.element(page.getByText("Read by ada")).toBeVisible();
  await expect.element(page.getByText("Report 7 by nobody, number 1")).toBeVisible();
});

test("computes again after a route handler has expired the tag", async () => {
  await renderServer({ url: "/reports/7" });
  await expect.element(page.getByText("Report 7 by nobody, number 1")).toBeVisible();

  const response = await revalidateReports();
  expect(await response.json()).toEqual({ revalidated: true });
  await renderServer({ url: "/reports/7" });

  await expect.element(page.getByText("Report 7 by nobody, number 2")).toBeVisible();
});

test("serves what is cached and computes again in the background after revalidateTag with a profile", async () => {
  await renderServer({ url: "/reports/7" });
  await expect.element(page.getByText("Report 7 by nobody, number 1")).toBeVisible();

  await revalidateReports("?profile=max");
  signInAs("ada");
  reports.duration = 300;
  await renderServer({ url: "/reports/7" });

  // The stale report, right away. The new one is being written meanwhile,
  // which does not get in the way of the rest of the page.
  await expect.element(page.getByText("Report 7 by nobody, number 1")).toBeVisible();
  await expect.element(page.getByText("Read by ada")).toBeVisible();

  reports.duration = 0;
  await renderServer({ url: "/reports/7" });
  await expect.element(page.getByText("Report 7 by nobody, number 2")).toBeVisible();
  expect(reports.written).toBe(2);
});

// Two tests that would see each other's report if a test did not start with
// an empty cache.
test.for(["ada", "grace"])("starts a test with an empty cache: %s", async (author) => {
  reports.author = author;

  await renderServer({ url: "/reports/7" });

  await expect.element(page.getByText(`Report 7 by ${author}, number 1`)).toBeVisible();
});

test("does not keep what a cached function computes after its test has ended", async () => {
  // Next reports the render that is stopped half way, and the component in
  // it that goes on without a request.
  consoleError.mockImplementation(() => {});
  reports.author = "ada";
  reports.duration = 500;
  await renderServer({ url: "/reports/7" });
  await expect.element(page.getByText("Writing the report…")).toBeVisible();

  // What runs between two tests, while the report is still being written.
  await cleanup();
  await expect.poll(() => reports.written).toBe(1);
  consoleError.mockClear();
  reports.author = "grace";
  reports.duration = 0;
  await renderServer({ url: "/reports/7" });

  await expect.element(page.getByText("Report 7 by grace, number 2")).toBeVisible();
});

test("keeps a force-cache fetch for the next request", async () => {
  const key = crypto.randomUUID();

  await renderServer({ url: `/hits?key=${key}` });
  await expect.element(page.getByText("Hits: 1 and 1")).toBeVisible();
  await renderServer({ url: `/hits?key=${key}` });

  await expect.element(page.getByText("Hits: 1 and 1")).toBeVisible();
  // The service was asked once: this is the second request.
  expect(await requestHits(key)).toBe(2);
});

test("sends a no-store fetch for every request, once per render", async () => {
  const key = crypto.randomUUID();

  await renderServer({ url: `/hits?key=${key}&cache=no-store` });
  await expect.element(page.getByText("Hits: 1 and 1")).toBeVisible();
  await renderServer({ url: `/hits?key=${key}&cache=no-store` });

  await expect.element(page.getByText("Hits: 2 and 2")).toBeVisible();
  expect(await requestHits(key)).toBe(3);
});

test("fetches again in the background once the revalidate time of a fetch has passed", async () => {
  const key = crypto.randomUUID();

  await renderServer({ url: `/hits?key=${key}&revalidate=1` });
  await expect.element(page.getByText("Hits: 1 and 1")).toBeVisible();
  await renderServer({ url: `/hits?key=${key}&revalidate=1` });
  // Within the second: from the cache.
  await expect.element(page.getByText("Hits: 1 and 1")).toBeVisible();
  expect(await requestHits(key)).toBe(2);

  await new Promise((resolve) => setTimeout(resolve, 1100));
  await renderServer({ url: `/hits?key=${key}&revalidate=1` });
  // Stale: this request still gets it, and makes Next fetch again.
  await expect.element(page.getByText("Hits: 1 and 1")).toBeVisible();

  await renderServer({ url: `/hits?key=${key}&revalidate=1` });
  await expect.element(page.getByText("Hits: 3 and 3")).toBeVisible();
});
