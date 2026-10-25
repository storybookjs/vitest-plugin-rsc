import { expect } from "vitest";
import { page, type Locator } from "vitest/browser";
import { signUserCookie } from "#lib/session-cookie.ts";
import { ada, createSession, createUser } from "./db.ts";

// The helpers of tests/vitest/, which tests/playwright/test.ts has too.

/** Signs a user in: their session, and its cookies in the page's requests. */
export async function signedIn(person = ada) {
  const user = await createUser(person);
  const token = await createSession(user.id);
  document.cookie = `session=${token}; path=/`;
  document.cookie = `session_user=${await signUserCookie(token, user)}; path=/`;
  return user;
}

/** The titles of the list of notes, in order. */
export async function expectTitles(titles: string[]): Promise<void> {
  const links: Locator = page.getByRole("list", { name: "Notes" }).getByRole("link");
  await expect.poll(() => links.elements().map((link) => link.textContent)).toEqual(titles);
}
