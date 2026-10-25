import { sessionCookies } from "#lib/session-cookie.ts";
import { ada, createSession, createUser } from "./db.ts";

// Signing in for the tests in the page, of every column: test/vitest.ts
// exports it, and so does each copy of test/vitest.ts with another `page`.

/** Signs a user in: their session, and its cookies as the app's sign-in sets them. */
export async function signedIn(person = ada) {
  const user = await createUser(person);
  for (const { name, value, maxAge } of await sessionCookies(await createSession(user.id), user))
    document.cookie = `${name}=${value}; path=/${maxAge ? `; max-age=${maxAge}` : ""}`;
  return user;
}
