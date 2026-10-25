import { expect, test } from "./test.ts";
import { seedNotes, storedNotes } from "#test/db.ts";

test("favorites a note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect(page.getByRole("button", { name: "Unfavorite" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("stores the favorite", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  expect((await storedNotes(user.id))[0]?.favorite).toBe(true);
});

test("unfavorites a note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Unfavorite" }).click();

  await expect(page.getByRole("button", { name: "Favorite", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("moves a favorite to the top of the list", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Groceries", "Ideas"]);
});

test("marks the favorite in the list", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expect(page.getByText("★ Favorite")).toBeVisible();
});

test("toggles back after two clicks", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await page.getByRole("button", { name: "Unfavorite" }).click();

  await expect(page.getByRole("button", { name: "Favorite", exact: true })).toBeVisible();
  await expect.poll(async () => (await storedNotes(user.id))[0]?.favorite).toBe(false);
});

test("leaves the other notes as they are", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [, note] = await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  expect((await storedNotes(user.id)).map((note) => note.favorite)).toEqual([false, true]);
});

test("keeps the content when favoriting", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  await expect(page.getByText("Oat milk")).toBeVisible();
});

test("keeps the favorite on the next visit", async ({ page, signedIn }) => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto(`/notes/${note!.id}`);

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  await page.goto(`/notes/${note!.id}`);

  await expect(page.getByRole("button", { name: "Unfavorite" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("lists the newest favorite first", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, [
    { title: "Groceries", favorite: true },
    { title: "Ideas" },
    { title: "Reading list", favorite: true },
  ]);
  await page.goto("/notes");

  await expectTitles(["Reading list", "Groceries", "Ideas"]);
});
