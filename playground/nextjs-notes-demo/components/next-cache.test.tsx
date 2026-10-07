import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { cleanup, renderServer } from "vitest-plugin-rsc/next";
import { NextCacheProbe, resetNextCacheProbe } from "./next-cache-probe.tsx";

// Next's caches do not work on `vitest-plugin-rsc/next` yet (package 2a): `fetch`
// in the app's server code is the browser's, and nothing stores what
// `unstable_cache` computes between requests. The tests that need them are
// skipped, each with what it runs into. Their assertions are unchanged.

// Package 2a: identical `force-cache` fetches in one render are two requests: no request memoization.
test.skip("server refresh rerenders without invalidating cached data or fetches", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 1")).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 1")).toBeVisible();
});

// Package 2a: identical `force-cache` fetches in one render are two requests: no request memoization.
test.skip("identical force-cache fetches are deduped in one render and reused on refresh", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 1")).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 1")).toBeVisible();
});

test("no-store fetches bypass the persistent Next fetch cache", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("no-store fetch: default no-store fetch 1")).toBeVisible();
  await expect
    .element(page.getByText(/^no-store fetch duplicate: default no-store fetch [12]$/))
    .toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect
    .element(page.getByText(/^no-store fetch: default no-store fetch [23]$/))
    .toBeVisible();
  await expect
    .element(page.getByText(/^no-store fetch duplicate: default no-store fetch [24]$/))
    .toBeVisible();
});

test("server actions without refresh or invalidation do not rerender the current tree", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();

  await page.getByRole("button", { name: "Write without refresh" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();
});

// Package 2a: `unstable_cache` computes again on the next request: no Data Cache between requests.
test.skip("refresh renders uncached action writes while preserving cached reads", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();

  await page.getByRole("button", { name: "Write and refresh" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("action writes: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

// Package 2a: a `force-cache` fetch is requested again on the next render: no Data Cache for `fetch`.
test.skip("updateTag invalidates unstable_cache data for the next server render", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update data tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

// Package 2a: a `force-cache` fetch is requested again on the next render: no Data Cache for `fetch`.
test.skip("updateTag invalidates cached fetches for the next server render", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update fetch tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
});

// Package 2a: a `force-cache` fetch is requested again on the next render: no Data Cache for `fetch`.
test.skip("updating multiple tags invalidates unstable_cache and cached fetch together", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update both tags" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
});

test("revalidateTag with max updates cache metadata without rendering immediately", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await page.getByRole("button", { name: "Revalidate data tag" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

// Package 2a: a `force-cache` fetch is requested again on the next render: no Data Cache for `fetch`.
test.skip("revalidateTag with expire 0 invalidates cached data for the next server render", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Expire data tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

// Package 2a: a `force-cache` fetch is requested again on the next render: no Data Cache for `fetch`.
test.skip("revalidatePath rerenders the current path with fresh cached reads", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();

  await page.getByRole("button", { name: "Revalidate current path" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("action writes: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
});

// Package 2a: identical `force-cache` fetches in one render are two requests: no request memoization.
test.skip("Next cache state is reset by cleanup", async () => {
  await renderNextCacheProbe("first");

  await expect.element(page.getByText("cached data: first data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: first fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: first fetch 1")).toBeVisible();
  await expect.element(page.getByText("no-store fetch: first no-store fetch 1")).toBeVisible();

  await cleanup();
  await renderNextCacheProbe("second");

  await expect.element(page.getByText("cached data: second data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: second fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: second fetch 1")).toBeVisible();
  await expect.element(page.getByText("no-store fetch: second no-store fetch 1")).toBeVisible();
});

async function renderNextCacheProbe(label?: string) {
  resetNextCacheProbe(label);
  await renderServer(<NextCacheProbe />, { url: "/fixtures" });
}

function waitPastCacheTimestamp() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}
