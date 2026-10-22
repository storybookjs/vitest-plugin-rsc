import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signedInAs, testUser } from "#test/auth.ts";

// The page of a note. One for one with speed/playwright/note-detail.spec.ts.

async function insertNote(values: Partial<typeof notes.$inferInsert> = {}) {
  const [note] = await db
    .insert(notes)
    .values({
      ownerId: testUser.id,
      title: "Roadmap thoughts",
      content: "Ship offline sync first.",
      updatedAt: new Date("2026-01-15T12:00:00.000Z"),
      ...values,
    })
    .returning();
  return note!;
}

test("renders the title, the content and the date of the note", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}` });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Roadmap thoughts" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Ship offline sync first.")).toBeInTheDocument();
  await expect.element(page.getByText("Updated Jan 15, 2026")).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "All notes" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Edit" })).toBeInTheDocument();
});

test("shows a placeholder when the note has no content", async () => {
  await signedInAs();
  const note = await insertNote({ title: "Empty", content: "" });

  await renderServer({ url: `/notes/${note.id}` });

  await expect.element(page.getByText("No content yet.")).toBeInTheDocument();
});

test("renders the favorite badge of a favorite note", async () => {
  await signedInAs();
  const note = await insertNote({ isFavorite: true });

  await renderServer({ url: `/notes/${note.id}` });

  await expect.element(page.getByText("Favorite", { exact: true })).toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Unfavorite note" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("favorites the note, which the database stores", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}` });
  await page.getByRole("button", { name: "Favorite note" }).click();

  await expect.element(page.getByRole("button", { name: "Unfavorite note" })).toBeInTheDocument();
  await expect
    .poll(async () => {
      const [row] = await db.select().from(notes).where(eq(notes.id, note.id));
      return row?.isFavorite;
    })
    .toBe(true);
});

test("deletes the note and goes back to the list", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}` });
  await page.getByRole("button", { name: "Delete" }).click();

  await expect.element(page.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
  expect(await db.select().from(notes).where(eq(notes.id, note.id))).toEqual([]);
});
