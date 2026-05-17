import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { resetNextCacheProbe } from "./next-cache-probe.tsx";

test.skip("server refresh rerenders without invalidating cached data (TODO: protocol worker)", async () => {
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

test.skip("identical force-cache fetches are deduped in one render after refresh (TODO: protocol worker)", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 1")).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch duplicate: default fetch 2")).toBeVisible();
});

test.skip("no-store fetches bypass the Next fetch cache after refresh (TODO: protocol worker)", async () => {
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

test("unstable_noStore is available in a request render scope", async () => {
  await renderServer({ url: "/next-no-store-probe" });

  await expect.element(page.getByText("unstable noStore called")).toBeVisible();
});

test("generated App Page render initializes Next cache handlers", async () => {
  await renderServer({ url: "/next-cache-handler-probe" });

  await expect
    .element(page.getByText("cache handlers: default, remote, notes-custom"))
    .toBeVisible();
});

test("use cache functions are hoisted into Next cache components runtime", async () => {
  resetNextCacheProbe();

  await renderServer({
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
  await expect
    .element(page.getByText(/use cache concurrent first: generation \d+ concurrent read [12]/))
    .toBeVisible();
  await expect
    .element(page.getByText(/use cache concurrent second: generation \d+ concurrent read [12]/))
    .toBeVisible();
  expect(getConcurrentUseCacheReadCount()).toMatch(/^[12]$/);
  await expect
    .element(page.getByText(/use cache closure first: generation \d+ same closure read 1/))
    .toBeVisible();
  await expect
    .element(page.getByText(/use cache closure second: generation \d+ same closure read 1/))
    .toBeVisible();
  await expect
    .element(page.getByText(/use cache closure different: generation \d+ different closure read 2/))
    .toBeVisible();
  await expect.element(page.getByText("use cache closure reads: 2")).toBeVisible();
  await expect
    .element(page.getByText(/use cache custom first: generation \d+ custom read 1/))
    .toBeVisible();
  await expect
    .element(page.getByText(/use cache custom second: generation \d+ custom read 1/))
    .toBeVisible();
  await expect.element(page.getByText("use cache custom reads: 1")).toBeVisible();
  expect(getCustomCacheHandlerEvents()).toContain("get");
  expect(getCustomCacheHandlerEvents()).toContain("set");
  await expect.element(page.getByText("use cache private cookie: private-value")).toBeVisible();
});

test("public use cache scopes reject request dynamic APIs", async () => {
  resetNextCacheProbe();

  await expectPublicUseCacheDynamicApiError(/cookies\(\).*use cache/i, {
    headers: { cookie: "next-public-cache=public-value" },
    url: "/next-use-cache-dynamic-api-probe",
  });
});

test("public use cache scopes reject request headers", async () => {
  resetNextCacheProbe();

  await expectPublicUseCacheDynamicApiError(/headers\(\).*use cache/i, {
    headers: { "x-next-public-cache": "public-value" },
    url: "/next-use-cache-dynamic-headers-probe",
  });
});

test("public use cache scopes reject connection", async () => {
  resetNextCacheProbe();

  await expectPublicUseCacheDynamicApiError(/connection\(\).*use cache/i, {
    url: "/next-use-cache-dynamic-connection-probe",
  });
});

async function expectPublicUseCacheDynamicApiError(
  expected: RegExp,
  options: Parameters<typeof renderServer>[0],
) {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await renderServer(options);

    const messages = [...consoleError.mock.calls, ...consoleLog.mock.calls].map((args) =>
      args.map(String).join(" "),
    );
    expect(messages.some((message) => expected.test(message))).toBe(true);
  } finally {
    consoleError.mockRestore();
    consoleLog.mockRestore();
  }
}

test.skip("server actions without refresh or invalidation do not rerender the current tree (TODO: protocol worker)", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();

  await page.getByRole("button", { name: "Write without refresh" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("action writes: 0")).toBeVisible();
});

test.skip("refresh renders uncached action writes while preserving cached reads (TODO: protocol worker)", async () => {
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

test.skip("updateTag invalidates unstable_cache data for the next server render (TODO: protocol worker)", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update data tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
});

test.skip("updateTag invalidates cached fetches for the next server render (TODO: protocol worker)", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update fetch tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
});

test.skip("updating multiple tags invalidates unstable_cache and cached fetch together (TODO: protocol worker)", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Update both tags" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
});

test.skip("revalidateTag with max updates cache metadata without rendering immediately (TODO: protocol worker)", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await page.getByRole("button", { name: "Revalidate data tag" }).click();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
});

test.skip("revalidateTag with expire 0 invalidates cached data for the next server render (TODO: protocol worker)", async () => {
  await renderNextCacheProbe();

  await expect.element(page.getByText("render: 1")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 1")).toBeVisible();
  await waitPastCacheTimestamp();
  await page.getByRole("button", { name: "Expire data tag" }).click();

  await expect.element(page.getByText("render: 2")).toBeVisible();
  await expect.element(page.getByText("cached data: default data 2")).toBeVisible();
  await expect.element(page.getByText("cached fetch: default fetch 2")).toBeVisible();
});

test.skip("revalidatePath rerenders the current path with fresh cached reads (TODO: protocol worker)", async () => {
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
  await renderServer({ url: "/next-cache-probe" });
}

function waitPastCacheTimestamp() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

function getConcurrentUseCacheReadCount() {
  const text = document.body.textContent ?? "";
  const first = text.match(/use cache concurrent first: generation \d+ concurrent read (\d+)/)?.[1];
  const second = text.match(
    /use cache concurrent second: generation \d+ concurrent read (\d+)/,
  )?.[1];
  const reads = text.match(/use cache concurrent reads: (\d+)/)?.[1];

  expect(first).toBeDefined();
  expect(second).toBe(first);
  expect(reads).toBe(first);
  return reads;
}

function getCustomCacheHandlerEvents() {
  const text = document.body.textContent ?? "";
  const events = text.match(/use cache custom handler events: ([\w, ]+)/)?.[1];
  expect(events).toBeDefined();
  return events ?? "";
}
