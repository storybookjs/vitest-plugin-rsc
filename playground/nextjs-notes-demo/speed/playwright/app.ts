import { randomUUID } from "node:crypto";
import { test as base, type BrowserContext } from "@playwright/test";
import { generateRandomString, makeSignature } from "better-auth/crypto";
import { session, user as userTable } from "#db/schema.ts";
import { auth } from "#lib/auth.ts";
import type { AuthUser } from "#lib/auth-session.ts";
import { db } from "#lib/db.ts";

// What test/auth.ts and the mocked database are to the Vitest tests, for the
// Playwright tests: the app's own `db`, on the Postgres that `next start`
// runs on, and a user signed in as Better Auth would have. The Vitest tests
// empty their database before each test; these tests share one database and
// run in parallel, so each signs in a user of its own and sees only their
// notes.
export { db };

/** A user of their own for the test, as `testUser` of test/auth.ts. */
function newUser(): AuthUser {
  const id = randomUUID();
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id,
    name: "Test User",
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
  };
}

/** `signedInAs()` of test/auth.ts, with the cookie in the browser context. */
async function signIn(context: BrowserContext, user: AuthUser): Promise<void> {
  await db.insert(userTable).values(user).onConflictDoNothing();
  const authContext = await auth.$context;
  const token = generateRandomString(32);
  const signedInAt = new Date();
  await db.insert(session).values({
    token,
    userId: user.id,
    createdAt: signedInAt,
    updatedAt: signedInAt,
    expiresAt: new Date(signedInAt.getTime() + authContext.sessionConfig.expiresIn * 1000),
  });
  const { name, attributes } = authContext.authCookies.sessionToken;
  const value = `${token}.${await makeSignature(token, authContext.secret)}`;
  const sameSite = attributes.sameSite?.toLowerCase();
  await context.addCookies([
    {
      name,
      value,
      // By domain and path: by a URL, the http:// of `next start`, Chromium
      // would refuse the `__Secure-` cookie of production, which it sends to
      // localhost all the same.
      domain: new URL(base.info().project.use.baseURL!).hostname,
      path: attributes.path ?? "/",
      httpOnly: attributes.httpOnly ?? true,
      secure: attributes.secure ?? false,
      sameSite: sameSite === "strict" ? "Strict" : sameSite === "none" ? "None" : "Lax",
    },
  ]);
}

export const test = base.extend<{
  /** Signs in a user of the test's own, and gives them back. */
  signedIn: () => Promise<AuthUser>;
}>({
  signedIn: async ({ context }, use) => {
    await use(async () => {
      const user = newUser();
      await signIn(context, user);
      return user;
    });
  },
});

export { expect } from "@playwright/test";
