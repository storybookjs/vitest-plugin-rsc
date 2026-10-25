import { expect, test } from "./test.ts";
import { storedNotes } from "#test/db.ts";

test("renders the form", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await expect(page.getByRole("heading", { name: "New note" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("");
  await expect(page.getByLabel("Content")).toHaveValue("");
  await expect(page.getByText("0 / 2000")).toBeVisible();
});

test("creates a note and opens it", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Groceries");
  await page.getByLabel("Content").fill("Oat milk, bread");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Note created.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Groceries" })).toBeVisible();
  await expect(page.getByText("Oat milk, bread")).toBeVisible();
});

test("stores the note", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Groceries");
  await page.getByLabel("Content").fill("Oat milk, bread");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Note created.")).toBeVisible();
  expect(await storedNotes(user.id)).toEqual([
    { title: "Groceries", content: "Oat milk, bread", favorite: false },
  ]);
});

test("trims the title", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("   Groceries   ");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByRole("heading", { name: "Groceries" })).toBeVisible();
  expect((await storedNotes(user.id))[0]?.title).toBe("Groceries");
});

test("creates a note without content", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Ideas");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("No content yet.")).toBeVisible();
});

test("counts the characters of the content", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Content").fill("Hello");

  await expect(page.getByText("5 / 2000")).toBeVisible();
});

test("lists the new note", async ({ page, signedIn, expectTitles }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByText("Note created.")).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Groceries"]);
});

test("cancels back to the list", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByRole("main").getByRole("link", { name: "Cancel" }).click();

  await expect(page.getByText("No notes yet")).toBeVisible();
});

test("counts the new note", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByText("Note created.")).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();

  await expect(page.getByText("1 note", { exact: true })).toBeVisible();
});

test("creates a note that is not a favorite", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByRole("button", { name: "Favorite", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
