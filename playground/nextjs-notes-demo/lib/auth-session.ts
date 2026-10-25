import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "#lib/auth.ts";

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession["user"];

/**
 * The signed-in user, once per render: the layout and the page both ask, and
 * each lookup is a check of the cookie's signature and two queries, the
 * session and its user. A Server Action, outside a render, looks it up anew.
 */
export const getOptionalUser = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
});

export async function requireUser() {
  const user = await getOptionalUser();
  if (!user) redirect("/auth/sign-in");
  return user;
}

export async function requireRole(role: string) {
  const user = await requireUser();
  if (user.role !== role) forbidden();
  return user;
}
