import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db.ts";
import { sessions, users } from "./schema.ts";
import {
  readUserCookie,
  signUserCookie,
  USER_COOKIE,
  USER_COOKIE_MAX_AGE,
  type SessionUser,
} from "./session-cookie.ts";

export const SESSION_COOKIE = "session";

const cookieOptions = { httpOnly: true, sameSite: "lax", path: "/" } as const;
const userCookieOptions = { ...cookieOptions, maxAge: USER_COOKIE_MAX_AGE };

// A prepared statement, as every request without a fresh user cookie runs
// it: see notes.ts.
const sessionUser = db
  .select({ user: { id: users.id, name: users.name, email: users.email } })
  .from(sessions)
  .innerJoin(users, eq(users.id, sessions.userId))
  .where(eq(sessions.token, sql.placeholder("token")))
  .prepare("session_user");

/**
 * The signed-in user of the request, by the session cookie: from the user
 * cookie while it is fresh, else from the database. The user cookie is
 * signed at sign-in and on a rename only, so five minutes after the sign-in,
 * every request looks the session up again.
 */
export const currentUser = cache(async (): Promise<SessionUser | undefined> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const fresh = await readUserCookie(jar.get(USER_COOKIE)?.value, token);
  if (fresh) return fresh;
  const [row] = await sessionUser.execute({ token });
  return row?.user;
});

/** The signed-in user, or a redirect to sign in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** A new session of the user, in the database and the cookies. */
export async function startSession(user: SessionUser): Promise<void> {
  const token = crypto.randomUUID();
  await db.insert(sessions).values({ token, userId: user.id });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions);
  jar.set(USER_COOKIE, await signUserCookie(token, user), userCookieOptions);
}

/** The user cookie anew, after the user changed. */
export async function updateSessionUser(user: SessionUser): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return;
  jar.set(USER_COOKIE, await signUserCookie(token, user), userCookieOptions);
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.delete(SESSION_COOKIE);
  jar.delete(USER_COOKIE);
}
