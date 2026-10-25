import { expect, test } from "./test.ts";
import { storedNotes } from "#test/db.ts";

test("requires a title", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
});

test("requires a title that is not only spaces", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("     ");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
});

test("rejects a title of more than 100 characters", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("x".repeat(101));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Title is at most 100 characters.")).toBeVisible();
});

test("accepts a title of 100 characters", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("x".repeat(100));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Note created.")).toBeVisible();
});

test("rejects content of more than 2000 characters", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Long");
  await page.getByLabel("Content").fill("x".repeat(2001));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Content is at most 2000 characters.")).toBeVisible();
});

test("keeps the title and the content after an error", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("x".repeat(101));
  await page.getByLabel("Content").fill("Keep this");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Title is at most 100 characters.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("x".repeat(101));
  await expect(page.getByLabel("Content")).toHaveValue("Keep this");
});

test("marks the title invalid", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
});

test("stores nothing after an error", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Content").fill("No title");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  expect(await storedNotes(user.id)).toEqual([]);
});

test("creates the note once the error is fixed", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByText("Title is required.")).toBeVisible();
  await page.getByLabel("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Note created.")).toBeVisible();
});

test("shows every error at once", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Content").fill("x".repeat(2001));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  await expect(page.getByText("Content is at most 2000 characters.")).toBeVisible();
});
