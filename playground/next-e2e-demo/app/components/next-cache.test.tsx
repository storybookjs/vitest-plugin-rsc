import { setupWorker } from "msw/browser";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { page } from "vitest/browser";
import { cleanup, renderServer } from "vitest-plugin-rsc/next";
import { nextCacheProbeFetchHandler } from "./next-cache-msw.ts";
import { NextCacheProbe, resetNextCacheProbe } from "./next-cache-probe.tsx";

// The cache tests of playground/nextjs-notes-demo, with the same probe. The
// assertions are the same too, but for the no-store fetches, which are exact
// here, and for two tests that go on where the ones of the notes demo stop. The service the probe fetches from is MSW, in this tab.

const worker = setupWorker(...nextCacheProbeFetchHandler);
let consoleError: MockInstance<typeof console.error>;

beforeAll(async () => {
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
});

afterAll(() => {
  worker.stop();
});

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

test("server refresh rerenders without invalidating cached data or fetches", async () => {
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

test("identical force-cache fetches are deduped in one render and reused on refresh", async () => {
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
  // The same request twice in one render is one request: Next sends it once.
  await expect
    .element(page.getByText("no-store fetch duplicate: default no-store fetch 1"))
    .toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("no-store fetch: default no-store fetch 2")).toBeVisible();
  await expect
    .element(page.getByText("no-store fetch duplicate: default no-store fetch 2"))
    .toBeVisible();
});

test("server actions without refresh or invalidation do not rerender the current tree", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();

  await page.getByRole("button", { name: "Write without refresh" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();

  // Not in the notes demo: the page still shows this when the action has not
  // run yet. Next runs actions in order, so after a refresh the first one has
  // run, and it shows that it rendered once more, not twice.
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.element(page.getByText("action writes: 1")).toBeVisible();
  await expect.element(page.getByText("render: 2")).toBeVisible();
});

test("refresh renders uncached action writes while preserving cached reads", async () => {
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

test("updateTag invalidates unstable_cache data for the next server render", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update data tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

test("updateTag invalidates cached fetches for the next server render", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update fetch tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
});

test("updating multiple tags invalidates unstable_cache and cached fetch together", async () => {
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
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Revalidate data tag" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();

  // Not in the notes demo: the page still shows this when the action has not
  // run yet. The render after it gets the stale data and makes Next compute
  // it again, for the render after that.
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.element(page.getByText("render: 3")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

test("revalidateTag with expire 0 invalidates cached data for the next server render", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Expire data tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

test("revalidatePath rerenders the current path with fresh cached reads", async () => {
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

test("Next cache state is reset by cleanup", async () => {
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
