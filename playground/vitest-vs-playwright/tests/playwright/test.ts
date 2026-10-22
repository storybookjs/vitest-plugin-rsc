import { test as base } from "@playwright/test";
import { resetDb } from "#test/db.ts";

// Playwright's `test`, with the database emptied before each test, as
// vitest.setup.ts does for the Vitest tests.
export const test = base.extend<{ emptyDb: void }>({
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
