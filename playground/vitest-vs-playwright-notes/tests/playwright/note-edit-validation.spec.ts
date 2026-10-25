import { expect, test } from "./test.ts";
import { createUser, seedNotes, storedNotes } from "#test/db.ts";

test("requires a title", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Title").fill("");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
});

test("rejects a title of more than 100 characters", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Title").fill("x".repeat(101));
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Title is at most 100 characters.")).toBeVisible();
});

test("rejects content of more than 2000 characters", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Content").fill("x".repeat(2001));
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Content is at most 2000 characters.")).toBeVisible();
});

test("keeps the edits after an error", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Title").fill("");
  await page.getByLabel("Content").fill("Changed");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  await expect(page.getByLabel("Content")).toHaveValue("Changed");
});

test("stores nothing after an error", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Title").fill("");
  await page.getByLabel("Content").fill("Changed");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  expect(await storedNotes(user.id)).toEqual([
    { title: "Groceries", content: "Oat milk", favorite: false },
  ]);
});

test("marks the title invalid", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Title").fill("");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
});

test("saves once the error is fixed", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Title").fill("");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Title is required.")).toBeVisible();
  await page.getByLabel("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Note saved.")).toBeVisible();
});

test("shows a 404 for the note of another user", async ({ page, people, signedIn }) => {
  await signedIn();
  const other = await createUser(people.grace);
  const [note] = await seedNotes(other.id, [{ title: "Grace's" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("shows a 404 for a note that does not exist", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/0/edit");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("counts the characters as one types", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto(`/notes/${note!.id}/edit`);

  await page.getByLabel("Content").fill("abc");

  await expect(page.getByText("3 / 2000")).toBeVisible();
});
