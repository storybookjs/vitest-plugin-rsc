import { test } from "vitest";
import { resetDb } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

// What `signedIn()` costs, which most tests of tests/vitest/ start with: a
// user with a hashed password, a session and its cookie.
test("signedIn()", async () => {
  const times: number[] = [];
  for (let run = 0; run < 21; run++) {
    await resetDb();
    const start = performance.now();
    await signedIn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`signedIn(): ${times[10]!.toFixed(2)} ms (median of 21)`);
});
