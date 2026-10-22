import { eq } from "drizzle-orm";
import { notes } from "#db/schema.ts";
import { db, expect, test } from "./app.ts";

// The form that edits a note. One for one with
// speed/vitest/edit-note.test.tsx.

async function insertNote(ownerId: string) {
  const [note] = await db
    .insert(notes)
    .values({ ownerId, title: "Reading list", content: "Books to read." })
    .returning();
  return note!;
}

test("renders the form filled in from the note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}/edit`);

  await expect(page.getByRole("heading", { level: 1, name: "Edit note" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Reading list");
  await expect(page.getByLabel("Content")).toHaveValue("Books to read.");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
});

test("renders the errors of the server and keeps the edits", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}/edit`);
  await page.getByLabel("Title").fill("");
  await page.getByLabel("Content").fill("Changed body");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Content")).toHaveValue("Changed body");
});

test("saves the changes and opens the note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}/edit`);
  await page.getByLabel("Title").fill("Reading list 2026");
  await page.getByLabel("Content").fill("Shape Up");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Reading list 2026" })).toBeVisible();
  await expect(page.getByText("Shape Up")).toBeVisible();
  const [row] = await db.select().from(notes).where(eq(notes.id, note.id));
  expect(row).toMatchObject({ title: "Reading list 2026", content: "Shape Up" });
});

test("goes back to the note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}/edit`);
  await page.getByRole("link", { name: "Back to note" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Reading list" })).toBeVisible();
});

test("opens the form from the page of the note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}`);
  await page.getByRole("link", { name: "Edit" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Edit note" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Reading list");
});
