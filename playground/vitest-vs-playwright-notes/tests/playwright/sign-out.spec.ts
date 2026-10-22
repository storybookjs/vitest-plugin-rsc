import { expect, test } from "./test.ts";
import { sessionCount } from "#test/db.ts";

test("signs out", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByText("You are signed out.")).toBeVisible();
});

test("ends the session", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByText("You are signed out.")).toBeVisible();
  expect(await sessionCount()).toBe(0);
});

test("shows the links to sign in after signing out", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/profile");

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByRole("navigation").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Signed in as Ada Lovelace")).toHaveCount(0);
});

for (const url of ["/notes", "/notes/new", "/profile", "/notes/1", "/notes/1/edit"]) {
  test(`sends a visitor of ${url} to sign in`, async ({ page }) => {
    await page.goto(url);

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
}

test("shows the home page to a visitor", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
});

test("sends a signed-in user from the home page to the notes", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/");

  await expect(page.getByText("0 notes")).toBeVisible();
  await expect(page.getByText("Signed in as Ada Lovelace")).toBeVisible();
});
