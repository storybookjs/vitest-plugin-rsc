import { sessionCookies } from "#lib/session-cookie.ts";
import { createSession, createUser } from "./db.ts";
import { ada, person } from "./people.ts";

// Signing in for the tests in the page, of every column: test/vitest.ts
// exports it, and so does each copy of test/vitest.ts with another `page`.

/**
 * Signs a user in, a person of the test's own, `person(who)`: their session,
 * and its cookies as the app's sign-in sets them. `who` is Ada or Grace of
 * test/people.ts; the user it returns has the email.
 */
export async function signedIn(who = ada) {
  const user = await createUser(person(who));
  for (const { name, value, maxAge } of await sessionCookies(await createSession(user.id), user))
    document.cookie = `${name}=${value}; path=/${maxAge ? `; max-age=${maxAge}` : ""}`;
  return user;
}
