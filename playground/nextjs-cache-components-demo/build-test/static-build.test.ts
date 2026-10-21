import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { viteBuild } from "../../test-helpers/build.ts";
import { serveFiles, test, type Site } from "../../test-helpers/host.ts";

// `"use cache"` in a static build, which is what `storybook build` makes:
// what keeps the scope of a cached function is compiled into Next's modules
// there too, without the dependency optimizer of a dev server.

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
let site: Site;

beforeAll(async () => {
  await viteBuild(root, dist);
  site = await serveFiles(dist);
});
afterAll(() => site?.close());

/** Opens the host page with the URL of the app in its query: see host/main.tsx. */
async function open(page: Page, url: string) {
  await page.goto(`${site.url}?${new URLSearchParams({ url })}`);
  await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
  expect(await page.evaluate(() => (window as { __hostState?: string }).__hostState)).toBe("ready");
}

const openNext = (page: Page, url: string) =>
  page.evaluate(
    (url) => (window as { __hostOpen?: (url: string) => Promise<void> }).__hostOpen!(url),
    url,
  );

test('keeps what a "use cache" function returns, which tags its entry after an await', async ({
  page,
}) => {
  await open(page, "/quotes");
  const first = await page.getByRole("heading").textContent();
  expect(first).toMatch(/^Quote \d+ about tabs$/);

  await openNext(page, "/quotes");
  expect(await page.getByRole("heading").textContent()).toBe(first);
});

test("renders what a cached component returns in its scope", async ({ page }) => {
  await open(page, "/nested");

  await page.getByText("Child of nobody, cookies() throws, tagged").waitFor();
});
