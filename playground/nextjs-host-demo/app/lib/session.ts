import { cookies } from "next/headers";

// Who is signed in: the name in the session cookie. The host page stands in
// for this module, as a test would mock it: see vite.config.ts.
export async function currentUser(): Promise<string | undefined> {
  return (await cookies()).get("session")?.value;
}
