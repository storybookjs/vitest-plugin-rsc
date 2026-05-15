import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import {
  NextCacheHandlerProbe,
  NextCacheProbe,
  NextNoStoreProbe,
  NextUseCacheDynamicApiProbe,
  NextUseCacheProbe,
  resetNextCacheProbe,
} from "./next-cache-probe";

test("server refresh rerenders without invalidating cached data", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 1")).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 2")).toBeVisible();
});

test("identical force-cache fetches are deduped in one render after refresh", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 1")).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 2")).toBeVisible();
});

test("no-store fetches bypass the Next fetch cache", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("no-store fetch: default no-store fetch 1")).toBeVisible();
  await expect
    .element(page.getByText("no-store fetch duplicate: default no-store fetch 2"))
    .toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("no-store fetch: default no-store fetch 3")).toBeVisible();
  await expect
    .element(page.getByText("no-store fetch duplicate: default no-store fetch 4"))
    .toBeVisible();
});

test("unstable_noStore is available in a request render scope", async () => {
  await renderServer(<NextNoStoreProbe />, { url: "/next-no-store-probe" });

  await expect.element(page.getByText("unstable noStore called")).toBeVisible();
});

test("app-render initializes Next cache handlers", async () => {
  await renderServer(<NextCacheHandlerProbe />, { url: "/next-cache-handler-probe" });

  await expect.element(page.getByText("cache handlers: default, remote")).toBeVisible();
});

test("use cache functions are hoisted into Next cache components runtime", async () => {
  resetNextCacheProbe();

  await renderServer(<NextUseCacheProbe />, {
    headers: { cookie: "next-private-cache=private-value" },
    url: "/next-use-cache-probe",
  });

  await expect.element(page.getByText(/use cache first: generation \d+ read 1/)).toBeVisible();
  await expect.element(page.getByText(/use cache second: generation \d+ read 1/)).toBeVisible();
  await expect.element(page.getByText("use cache reads: 1")).toBeVisible();
  await expect
    .element(page.getByText(/use cache remote first: generation \d+ remote read 1/))
    .toBeVisible();
  await expect
    .element(page.getByText(/use cache remote second: generation \d+ remote read 1/))
    .toBeVisible();
  await expect.element(page.getByText("use cache remote reads: 1")).toBeVisible();
  await expect
    .element(page.getByText(/use cache life first: generation \d+ cache life read 1/))
    .toBeVisible();
  await expect
    .element(page.getByText(/use cache life second: generation \d+ cache life read 1/))
    .toBeVisible();
  await expect.element(page.getByText("use cache life reads: 1")).toBeVisible();
  await expect.element(page.getByText("use cache private cookie: private-value")).toBeVisible();
});

test("public use cache scopes reject request dynamic APIs", async () => {
  resetNextCacheProbe();

  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await renderServer(<NextUseCacheDynamicApiProbe />, {
      headers: { cookie: "next-public-cache=public-value" },
      url: "/next-use-cache-dynamic-api-probe",
    });

    const messages = [...consoleError.mock.calls, ...consoleLog.mock.calls].map((args) =>
      args.map(String).join(" "),
    );
    expect(messages.some((message) => /cookies\(\).*use cache/i.test(message))).toBe(true);
  } finally {
    consoleError.mockRestore();
    consoleLog.mockRestore();
  }
});

test("server actions without refresh or invalidation do not rerender the current tree", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();

  await page.getByRole("button", { name: "Write without refresh" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();
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
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
});

test("updateTag invalidates unstable_cache data for the next server render", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update data tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
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
  await page.getByRole("button", { name: "Revalidate data tag" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
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
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
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
  await renderServer(<NextCacheProbe />, { url: "/next-cache-probe" });
}

function waitPastCacheTimestamp() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}
