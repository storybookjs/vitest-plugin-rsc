import { cookies } from "next/headers";
import { runInServerAction } from "vitest-plugin-rsc/nextjs/testing-library";

// Helpers of the tests that sign in. Not in browser.ts: a test file with
// `"use client"` imports that one in the browser layer, which has no
// `next/headers`, as a Client Component of the app has none.

// Sets the session cookie of the app, the way a Server Action would.
export async function signInAs(user: string): Promise<void> {
  await runInServerAction(async () => {
    (await cookies()).set("session", user);
  });
}
