import { expect, test } from "./test.ts";
import { seedNotes, storedNotes } from "#test/db.ts";

test("fills the form in from the note", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto("/notes/1/edit");

  await expect(page.getByRole("heading", { name: "Edit note" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Groceries");
  await expect(page.getByLabel("Content")).toHaveValue("Oat milk");
});

test("counts the characters of the content there is", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto("/notes/1/edit");

  await expect(page.getByText("8 / 2000")).toBeVisible();
});

test("saves the note and opens it", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto("/notes/1/edit");

  await page.getByLabel("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Note saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();
});

test("stores the changes", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto("/notes/1/edit");

  await page.getByLabel("Title").fill("Shopping");
  await page.getByLabel("Content").fill("Bread");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("Note saved.")).toBeVisible();
  expect(await storedNotes()).toEqual([{ title: "Shopping", content: "Bread", favorite: false }]);
});

test("trims the title", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/1/edit");

  await page.getByLabel("Title").fill("  Shopping  ");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();
  expect((await storedNotes())[0]?.title).toBe("Shopping");
});

test("empties the content", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto("/notes/1/edit");

  await page.getByLabel("Content").fill("");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText("No content yet.")).toBeVisible();
});

test("cancels without saving", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/1/edit");

  await page.getByLabel("Title").fill("Shopping");
  await page.getByRole("main").getByRole("link", { name: "Cancel" }).click();

  await expect(page.getByRole("heading", { name: "Groceries" })).toBeVisible();
  expect((await storedNotes())[0]?.title).toBe("Groceries");
});

test("edits a note from its page", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/1");

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();
});

test("lists the new title", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await page.goto("/notes/1/edit");

  await page.getByLabel("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved.")).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Ideas", "Shopping"]);
});

test("keeps the favorite", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await page.goto("/notes/1/edit");

  await page.getByLabel("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByRole("button", { name: "Unfavorite" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
