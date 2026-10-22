import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signedInAs, testUser } from "#test/auth.ts";

// The form that edits a note. One for one with
// speed/playwright/edit-note.spec.ts.

async function insertNote() {
  const [note] = await db
    .insert(notes)
    .values({ ownerId: testUser.id, title: "Reading list", content: "Books to read." })
    .returning();
  return note!;
}

test("renders the form filled in from the note", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}/edit` });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Edit note" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("Reading list");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Books to read.");
  await expect.element(page.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
});

test("renders the errors of the server and keeps the edits", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}/edit` });
  await page.getByLabelText("Title").fill("");
  await page.getByLabelText("Content").fill("Changed body");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Changed body");
});

test("saves the changes and opens the note", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}/edit` });
  await page.getByLabelText("Title").fill("Reading list 2026");
  await page.getByLabelText("Content").fill("Shape Up");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Reading list 2026" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Shape Up")).toBeInTheDocument();
  const [row] = await db.select().from(notes).where(eq(notes.id, note.id));
  expect(row).toMatchObject({ title: "Reading list 2026", content: "Shape Up" });
});

test("goes back to the note", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}/edit` });
  await page.getByRole("link", { name: "Back to note" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Reading list" }))
    .toBeInTheDocument();
});

test("opens the form from the page of the note", async () => {
  await signedInAs();
  const note = await insertNote();

  await renderServer({ url: `/notes/${note.id}` });
  await page.getByRole("link", { name: "Edit" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Edit note" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("Reading list");
});
