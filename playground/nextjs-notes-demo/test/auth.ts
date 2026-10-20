import { generateRandomString, makeSignature } from "better-auth/crypto";
import { cookies } from "next/headers";
import { runInServerAction } from "vitest-plugin-rsc/nextjs/testing-library";
import { session, user as userTable } from "#db/schema.ts";
import { auth } from "#lib/auth.ts";
import type { AuthUser } from "#lib/auth-session.ts";
import { db } from "#lib/db.ts";

const now = new Date("2026-01-01T00:00:00.000Z");

export const testUser = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test User",
  email: "test@example.com",
  emailVerified: true,
  image: null,
  role: "user",
  createdAt: now,
  updatedAt: now,
} satisfies AuthUser;

export const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Other User",
  email: "other@example.com",
  emailVerified: true,
  image: null,
  role: "user",
  createdAt: now,
  updatedAt: now,
} satisfies AuthUser;

/**
 * `user` signed in, as after Better Auth signed them in: their row and a
 * session in the database, and the signed cookie of the session in the
 * browser, which Better Auth reads from each request. For a test, or the
 * `beforeEach` of a story. Another call signs another user in.
 */
export async function signedInAs(user: AuthUser = testUser): Promise<void> {
  await db.insert(userTable).values(user).onConflictDoNothing();
  const context = await auth.$context;
  const token = generateRandomString(32);
  // The clock of the test, which Better Auth reads to see whether the
  // session has expired.
  const signedInAt = new Date();
  await db.insert(session).values({
    token,
    userId: user.id,
    createdAt: signedInAt,
    updatedAt: signedInAt,
    expiresAt: new Date(signedInAt.getTime() + context.sessionConfig.expiresIn * 1000),
  });
  const { name, attributes } = context.authCookies.sessionToken;
  const value = `${token}.${await makeSignature(token, context.secret)}`;
  await runInServerAction(async () => {
    // Next takes `SameSite` in lower case only.
    const sameSite = attributes.sameSite?.toLowerCase() as "lax" | "strict" | "none" | undefined;
    (await cookies()).set(name, value, { ...attributes, sameSite });
  });
}
