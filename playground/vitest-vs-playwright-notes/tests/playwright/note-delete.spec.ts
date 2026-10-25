import { expect, test } from "./test.ts";
import { createUser, seedNotes, storedNotes } from "#test/db.ts";

test("deletes a note and goes back to the list", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
});

test("removes the note from the database", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
  expect(await storedNotes(user.id)).toEqual([]);
});

test("removes the note from the list", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
  await expectTitles(["Ideas"]);
});

test("counts one note less", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [, note] = await seedNotes(user.id, [
    { title: "Groceries" },
    { title: "Ideas" },
    { title: "Reading list" },
  ]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("2 notes")).toBeVisible();
});

test("keeps the other notes", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [, note] = await seedNotes(user.id, [
    { title: "Groceries" },
    { title: "Ideas" },
    { title: "Reading list" },
  ]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
  expect((await storedNotes(user.id)).map((note) => note.title)).toEqual([
    "Groceries",
    "Reading list",
  ]);
});

test("shows the empty state after the last note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("No notes yet")).toBeVisible();
});

test("shows a 404 for the deleted note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Note deleted.")).toBeVisible();
  await page.goto(`/notes/${note!.id}`);

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("deletes a favorite", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
  await expect(page.getByText("★ Favorite")).toHaveCount(0);
});

test("keeps the notes of other users", async ({ page, people, signedIn }) => {
  const user = await signedIn();
  const other = await createUser(people.grace);
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
  expect((await storedNotes(user.id, other.id)).map((note) => note.title)).toEqual(["Grace's"]);
});

test("shows no banner on a later visit of the list", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Note deleted.")).toBeVisible();
  await page.goto("/notes");

  await expect(page.getByText("No notes yet")).toBeVisible();
  await expect(page.getByText("Note deleted.")).toHaveCount(0);
});
