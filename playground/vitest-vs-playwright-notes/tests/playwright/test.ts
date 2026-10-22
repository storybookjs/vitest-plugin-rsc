import { expect, test as base } from "@playwright/test";
import { ada, createSession, createUser, resetDb } from "#test/db.ts";
import type { User } from "#lib/schema.ts";

// Playwright's `test` with the helpers of test/vitest.ts, and the database
// emptied before each test, as vitest.setup.ts does for the Vitest tests.
export const test = base.extend<{
  emptyDb: void;
  signedIn: (person?: typeof ada) => Promise<User>;
  expectTitles: (titles: string[]) => Promise<void>;
}>({
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
  signedIn: async ({ context, baseURL }, use) => {
    await use(async (person = ada) => {
      const user = await createUser(person);
      const value = await createSession(user.id);
      await context.addCookies([{ name: "session", value, url: baseURL! }]);
      return user;
    });
  },
  expectTitles: async ({ page }, use) => {
    await use(async (titles) => {
      await expect(page.getByRole("list", { name: "Notes" }).getByRole("link")).toHaveText(titles);
    });
  },
});

export { expect };
