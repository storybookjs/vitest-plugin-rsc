import { expect, test } from "./test.ts";
import { createUser, grace, seedNotes } from "#test/db.ts";

test("shows the title and the content", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk, bread" }]);
  await page.goto("/notes/1");

  await expect(page.getByRole("heading", { name: "Groceries" })).toBeVisible();
  await expect(page.getByText("Oat milk, bread")).toBeVisible();
});

test("shows a placeholder without content", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Ideas" }]);
  await page.goto("/notes/1");

  await expect(page.getByText("No content yet.")).toBeVisible();
});

test("shows a 404 for a note that does not exist", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/42");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("shows a 404 for an id that is not a number", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/groceries");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("shows a 404 for the note of another user", async ({ page, signedIn }) => {
  await signedIn();
  const other = await createUser(grace);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await page.goto("/notes/1");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("offers to favorite a note", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/1");

  await expect(page.getByRole("button", { name: "Favorite", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("offers to unfavorite a favorite", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await page.goto("/notes/1");

  await expect(page.getByRole("button", { name: "Unfavorite" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("opens the edit form", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/1");

  await page.getByRole("link", { name: "Edit" }).click();

  await expect(page.getByRole("heading", { name: "Edit note" })).toBeVisible();
});

test("goes back to all notes", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await page.goto("/notes/1");

  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Ideas", "Groceries"]);
});

test("shows no banner on a later visit", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/1");

  await expect(page.getByRole("heading", { name: "Groceries" })).toBeVisible();
  await expect(page.getByText("Note created.")).toHaveCount(0);
});
