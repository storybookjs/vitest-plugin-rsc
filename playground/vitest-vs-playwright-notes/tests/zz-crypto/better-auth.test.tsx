import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { expect, test } from "vitest";

// What Better Auth's sign-up and sign-in with a password cost in the page:
// each hashes the password with scrypt, which in a browser is @noble/hashes,
// in JavaScript. A Better Auth of its own, on a database in memory, called
// as a Server Action calls it, through `auth.api`. With `fastCrypto` it
// hashes with the stand-in, by the same code: the app's config is the same.

const db: Record<string, Record<string, unknown>[]> = {
  user: [],
  session: [],
  account: [],
  verification: [],
};
const auth = betterAuth({
  baseURL: "http://localhost:3000",
  secret: "a secret of the tests that is long enough",
  database: memoryAdapter(db),
  emailAndPassword: { enabled: true },
});

test("Better Auth: sign up, then sign in, with a password", { timeout: 120_000 }, async () => {
  const times: number[] = [];
  for (let run = 0; run < 5; run++) {
    const email = `ada${run}@example.com`;
    const start = performance.now();
    await auth.api.signUpEmail({ body: { email, password: "correct horse", name: "Ada" } });
    const signedIn = await auth.api.signInEmail({ body: { email, password: "correct horse" } });
    times.push(performance.now() - start);
    expect(signedIn.user.email).toBe(email);
    await expect(
      auth.api.signInEmail({ body: { email, password: "wrong password" } }),
    ).rejects.toThrow();
  }
  times.sort((a, b) => a - b);
  console.log(
    `Better Auth signUpEmail + signInEmail: ${times[2]!.toFixed(1)} ms (median of 5), ` +
      `stored hash ${JSON.stringify(String(db.account![0]!.password).slice(0, 40))}...`,
  );
});
