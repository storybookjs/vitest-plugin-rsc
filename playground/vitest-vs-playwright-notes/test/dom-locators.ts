import { expect } from "vitest";
import { page, type Locator } from "dom-locators";
import { ada, createSession, createUser } from "./db.ts";

// The helpers of tests/dom-locators/: test/vitest.ts, by test/write-dom-locators-tests.ts.

/** Signs a user in: their session, and its cookie in the page's requests. */
export async function signedIn(person = ada) {
  const user = await createUser(person);
  document.cookie = `session=${await createSession(user.id)}; path=/`;
  return user;
}

/** The titles of the list of notes, in order. */
export async function expectTitles(titles: string[]): Promise<void> {
  const links: Locator = page.getByRole("list", { name: "Notes" }).getByRole("link");
  await expect.poll(() => links.elements().map((link) => link.textContent)).toEqual(titles);
}
