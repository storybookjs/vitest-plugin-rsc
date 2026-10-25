import { expect } from "vitest";
import { page, type Locator } from "vitest/browser";

// The helpers of tests/vitest/, which tests/playwright/test.ts has too.

export { signedIn } from "./sign-in.ts";

/** The titles of the list of notes, in order. */
export async function expectTitles(titles: string[]): Promise<void> {
  const links: Locator = page.getByRole("list", { name: "Notes" }).getByRole("link");
  await expect.poll(() => links.elements().map((link) => link.textContent)).toEqual(titles);
}
