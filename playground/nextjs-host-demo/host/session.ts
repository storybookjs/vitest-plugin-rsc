// What the host page has for app/lib/session.ts, which a test would mock:
// the user that main.tsx signs in. See vite.config.ts.
let user: string | undefined;

export function signIn(name: string | undefined): void {
  user = name;
}

export async function currentUser(): Promise<string | undefined> {
  return user;
}
