import { expect, test } from "./test.ts";
import { ada, createUser, seedNotes } from "#test/db.ts";

test("goes from the home page to sign up", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Create an account" }).click();

  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
});

test("goes from the home page to sign in", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("goes from the profile back to the notes", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/profile");

  await page.getByRole("link", { name: "Notes", exact: true }).click();

  await expect(page.getByText("No notes yet")).toBeVisible();
});

test("signs up and writes a first note", async ({ page, expectTitles }) => {
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(ada.name);
  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "New note" }).click();
  await page.getByLabel("Title").fill("First note");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByText("Note created.")).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["First note"]);
});

test("signs in, searches and opens a note", async ({ page }) => {
  const user = await createUser(ada);
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }, { title: "Ideas" }]);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Search").fill("oat");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Groceries" }).click();

  await expect(page.getByText("Oat milk")).toBeVisible();
});

test("writes, edits and lists a note", async ({ page, signedIn, expectTitles }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Draft");
  await page.getByRole("button", { name: "Create note" }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Final");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved.")).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Final"]);
});

test("writes and favorites a note", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Older" }]);
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Newer");
  await page.getByRole("button", { name: "Create note" }).click();
  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expect(page.getByText("★ Favorite")).toBeVisible();
  await expectTitles(["Newer", "Older"]);
});

test("writes and deletes a note", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Temporary");
  await page.getByRole("button", { name: "Create note" }).click();
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
  await expect(page.getByText("No notes yet")).toBeVisible();
});

test("signs out and back in", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as Ada Lovelace")).toBeVisible();
});

test("renames oneself and sees the name in the header", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByLabel("Name").fill("Countess Lovelace");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await page.getByRole("link", { name: "Notes", exact: true }).click();

  await expect(page.getByText("Signed in as Countess Lovelace")).toBeVisible();
});
