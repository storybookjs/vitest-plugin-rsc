import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db.ts";
import { sessions, users, type User } from "./schema.ts";

export const SESSION_COOKIE = "session";

// A prepared statement, as every request runs it: see notes.ts.
const sessionUser = db
  .select({ user: users })
  .from(sessions)
  .innerJoin(users, eq(users.id, sessions.userId))
  .where(eq(sessions.token, sql.placeholder("token")))
  .prepare("session_user");

/** The signed-in user of the request, by the session cookie. */
export const currentUser = cache(async (): Promise<User | undefined> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const [row] = await sessionUser.execute({ token });
  return row?.user;
});

/** The signed-in user, or a redirect to sign in. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** A new session of the user, in the database and the cookie. */
export async function startSession(userId: number): Promise<void> {
  const token = crypto.randomUUID();
  await db.insert(sessions).values({ token, userId });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.delete(SESSION_COOKIE);
}
