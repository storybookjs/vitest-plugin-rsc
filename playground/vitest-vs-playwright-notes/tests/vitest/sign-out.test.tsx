import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { sessionCount } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("signs out", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect.element(page.getByText("You are signed out.")).toBeInTheDocument();
});

test("ends the session", async () => {
  const user = await signedIn();
  await renderServer({ url: "/notes" });

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect.element(page.getByText("You are signed out.")).toBeInTheDocument();
  expect(await sessionCount(user.id)).toBe(0);
});

test("shows the links to sign in after signing out", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect
    .element(page.getByRole("navigation").getByRole("link", { name: "Sign in" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada Lovelace")).not.toBeInTheDocument();
});

for (const url of ["/notes", "/notes/new", "/profile", "/notes/1", "/notes/1/edit"]) {
  test(`sends a visitor of ${url} to sign in`, async () => {
    await renderServer({ url });

    await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
}

test("shows the home page to a visitor", async () => {
  await renderServer({ url: "/" });

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Create an account" })).toBeInTheDocument();
});

test("sends a signed-in user from the home page to the notes", async () => {
  await signedIn();
  await renderServer({ url: "/" });

  await expect.element(page.getByText("0 notes")).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});
