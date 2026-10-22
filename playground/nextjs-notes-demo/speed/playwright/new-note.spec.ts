import { eq } from "drizzle-orm";
import { notes } from "#db/schema.ts";
import { db, expect, test } from "./app.ts";

// The form of a new note. One for one with speed/vitest/new-note.test.tsx.

test("renders the form with empty fields", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await expect(page.getByRole("heading", { level: 1, name: "New note" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("");
  await expect(page.getByLabel("Content")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Create note" })).toBeVisible();
});

test("creates a note and opens it", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Title").fill("Groceries");
  await page.getByLabel("Content").fill("Oat milk, sourdough");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Groceries" })).toBeVisible();
  await expect(page.getByText("Oat milk, sourdough")).toBeVisible();
  const rows = await db.select().from(notes).where(eq(notes.ownerId, user.id));
  expect(rows.map((row) => row.title)).toEqual(["Groceries"]);
});

test("renders the errors of the server and keeps the input", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Content")).toHaveValue("Keep this body");
});

test("shows the flashed errors once, not on a later visit", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByLabel("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByText("Title is required.")).toBeVisible();

  await page.getByRole("link", { name: "All notes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
  await page.getByRole("link", { name: "New note" }).first().click();

  await expect(page.getByRole("heading", { level: 1, name: "New note" })).toBeVisible();
  await expect(page.getByText("Title is required.")).toHaveCount(0);
  await expect(page.getByLabel("Content")).toHaveValue("");
});

test("cancels back to the list", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes/new");

  await page.getByRole("link", { name: "Cancel" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
});
