import { expect, test as base } from "vitest";
import { page, type Locator } from "vitest/browser";
import { ada, grace, person, type Person } from "./people.ts";

// The helpers of tests/vitest/, which tests/playwright/test.ts has too.

export { signedIn } from "./sign-in.ts";

/** Vitest's `test` with `people`: Ada and Grace of this test, for the tests that fill the forms. */
export const test = base.extend<{ people: { ada: Person; grace: Person } }>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest reads the fixtures a fixture uses from this pattern.
  people: async ({}, use) => {
    await use({ ada: person(ada), grace: person(grace) });
  },
});

/** The titles of the list of notes, in order. */
export async function expectTitles(titles: string[]): Promise<void> {
  const links: Locator = page.getByRole("list", { name: "Notes" }).getByRole("link");
  await expect.poll(() => links.elements().map((link) => link.textContent)).toEqual(titles);
}
