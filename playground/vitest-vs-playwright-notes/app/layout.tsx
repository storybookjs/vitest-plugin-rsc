import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "#lib/actions.ts";
import { currentUser } from "#lib/auth.ts";

export const metadata = { title: "Notes" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header>
          <nav aria-label="Main">
            {user ? (
              <>
                <Link href="/notes">Notes</Link> <Link href="/profile">Profile</Link>{" "}
                <span>Signed in as {user.name}</span>
                <form action={signOut}>
                  <button type="submit">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in">Sign in</Link> <Link href="/sign-up">Sign up</Link>
              </>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
