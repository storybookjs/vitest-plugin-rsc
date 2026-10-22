import { eq } from "drizzle-orm";
import { notes } from "#db/schema.ts";
import { db, expect, test } from "./app.ts";

// The page of a note. One for one with speed/vitest/note-detail.test.tsx.

async function insertNote(ownerId: string, values: Partial<typeof notes.$inferInsert> = {}) {
  const [note] = await db
    .insert(notes)
    .values({
      ownerId,
      title: "Roadmap thoughts",
      content: "Ship offline sync first.",
      updatedAt: new Date("2026-01-15T12:00:00.000Z"),
      ...values,
    })
    .returning();
  return note!;
}

test("renders the title, the content and the date of the note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}`);

  await expect(page.getByRole("heading", { level: 1, name: "Roadmap thoughts" })).toBeVisible();
  await expect(page.getByText("Ship offline sync first.")).toBeVisible();
  await expect(page.getByText("Updated Jan 15, 2026")).toBeVisible();
  await expect(page.getByRole("link", { name: "All notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
});

test("shows a placeholder when the note has no content", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id, { title: "Empty", content: "" });

  await page.goto(`/notes/${note.id}`);

  await expect(page.getByText("No content yet.")).toBeVisible();
});

test("renders the favorite badge of a favorite note", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id, { isFavorite: true });

  await page.goto(`/notes/${note.id}`);

  await expect(page.getByText("Favorite", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unfavorite note" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("favorites the note, which the database stores", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}`);
  await page.getByRole("button", { name: "Favorite note" }).click();

  await expect(page.getByRole("button", { name: "Unfavorite note" })).toBeVisible();
  await expect
    .poll(async () => {
      const [row] = await db.select().from(notes).where(eq(notes.id, note.id));
      return row?.isFavorite;
    })
    .toBe(true);
});

test("deletes the note and goes back to the list", async ({ page, signedIn }) => {
  const user = await signedIn();
  const note = await insertNote(user.id);

  await page.goto(`/notes/${note.id}`);
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
  await expect(page.getByText("No notes yet")).toBeVisible();
  expect(await db.select().from(notes).where(eq(notes.id, note.id))).toEqual([]);
});
