import { expect, test } from "./test.ts";
import { createUser, seedNotes } from "#test/db.ts";

test("shows an empty state", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await expect(page.getByText("No notes yet")).toBeVisible();
  await expect(page.getByText("0 notes")).toBeVisible();
});

test("counts one note", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes");

  await expect(page.getByText("1 note", { exact: true })).toBeVisible();
});

test("counts the notes", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Reading list" }, { title: "Ideas" }]);
  await page.goto("/notes");

  await expect(page.getByText("3 notes")).toBeVisible();
});

test("lists the newest note first", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Reading list" }, { title: "Ideas" }]);
  await page.goto("/notes");

  await expectTitles(["Ideas", "Reading list", "Groceries"]);
});

test("lists the favorites first", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, [
    { title: "Groceries", favorite: true },
    { title: "Reading list" },
    { title: "Ideas" },
  ]);
  await page.goto("/notes");

  await expectTitles(["Groceries", "Ideas", "Reading list"]);
});

test("marks the favorites", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }, { title: "Ideas" }]);
  await page.goto("/notes");

  await expect(page.getByText("★ Favorite")).toBeVisible();
});

test("opens a note from the list", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk, bread" }]);
  await page.goto("/notes");

  await page.getByRole("link", { name: "Groceries" }).click();

  await expect(page.getByRole("heading", { name: "Groceries" })).toBeVisible();
  await expect(page.getByText("Oat milk, bread")).toBeVisible();
});

test("opens the form of a new note", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await page.getByRole("link", { name: "New note" }).click();

  await expect(page.getByRole("heading", { name: "New note" })).toBeVisible();
});

test("lists only the notes of the user", async ({ page, people, signedIn, expectTitles }) => {
  const user = await signedIn();
  const other = await createUser(people.grace);
  await seedNotes(user.id, [{ title: "Mine" }]);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await page.goto("/notes");

  await expectTitles(["Mine"]);
  await expect(page.getByText("1 note", { exact: true })).toBeVisible();
});

test("opens the profile from the header", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await page.getByRole("link", { name: "Profile" }).click();

  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
});
