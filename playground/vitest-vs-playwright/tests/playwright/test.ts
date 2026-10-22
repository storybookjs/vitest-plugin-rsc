import { test as base } from "@playwright/test";
import { resetDb } from "#test/db.ts";

// Playwright's `test`, with the database emptied before each test, as
// vitest.setup.ts does for the Vitest tests.
export const test = base.extend<{ emptyDb: void }>({
  // `page.goto()` that waits until the page has hydrated, as `renderServer()`
  // does: an interaction before that is lost, or undone as React hydrates.
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.waitForFunction(() => "__NEXT_HYDRATED_AT" in window);
      return response;
    };
    await use(page);
  },
  emptyDb: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture uses from this pattern.
    async ({}, use) => {
      await resetDb();
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
