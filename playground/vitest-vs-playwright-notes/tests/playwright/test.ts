import { expect, test as base } from "@playwright/test";
import { createSession, createUser } from "#test/db.ts";
import { ada, grace, person, type Person } from "#test/people.ts";
import type { User } from "#lib/schema.ts";
import { sessionCookies } from "#lib/session-cookie.ts";

// Playwright's `test` with the helpers of test/vitest.ts. Each test signs in
// and signs up as people of its own (test/people.ts), so the tests run in
// parallel on one database, which nothing empties between them.
export const test = base.extend<{
  people: { ada: Person; grace: Person };
  signedIn: (who?: Person) => Promise<User>;
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
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture uses from this pattern.
  people: async ({}, use) => {
    await use({ ada: person(ada), grace: person(grace) });
  },
  // `signedIn()` of test/sign-in.ts: `person(who)`, a person of the test's own.
  signedIn: async ({ context, baseURL }, use) => {
    await use(async (who = ada) => {
      const user = await createUser(person(who));
      const cookies = await sessionCookies(await createSession(user.id), user);
      await context.addCookies(
        cookies.map(({ name, value, maxAge }) => ({
          name,
          value,
          url: baseURL!,
          ...(maxAge && { expires: Date.now() / 1000 + maxAge }),
        })),
      );
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
