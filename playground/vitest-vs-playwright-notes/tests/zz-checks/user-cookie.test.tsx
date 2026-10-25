import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { db } from "#lib/db.ts";
import { sessions } from "#lib/schema.ts";
import { signedIn } from "#test/vitest.ts";

// A request of a signed-in user reads the user from the user cookie, not the
// session from the database: with the session gone from the database, the
// cookie alone keeps the user signed in. So `signedIn()` leaves the cookie
// that the app's sign-in sets, and the tests' requests don't look the session
// up, as a user's don't.

test("signedIn() leaves the user cookie of a sign-in", async () => {
  await signedIn();
  await db.delete(sessions);
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("without the user cookie, a request looks the session up", async () => {
  await signedIn();
  document.cookie = "session_user=; path=/; max-age=0";
  await db.delete(sessions);
  await renderServer({ url: "/notes" });

  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});
