import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { signInAs, testUser } from "#test/auth.ts";
import { renderServer } from "#test/render.tsx";
import EditNotePage from "./page.tsx";

const noteId = "00000000-0000-4000-8000-000000000001";

test("renders the edit form prefilled from the note", async () => {
  await signInAs();
  await db.insert(notes).values({
    id: noteId,
    ownerId: testUser.id,
    title: "Reading list",
    content: "Books to read this quarter.",
  });

  await renderServer(<EditNotePage params={Promise.resolve({ id: noteId })} />, {
    route: "/notes/[id]/edit",
    url: `/notes/${noteId}/edit`,
  });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Edit note" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("Reading list");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Books to read this quarter.");
  await expect.element(page.getByRole("link", { name: "Back to note" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
});

test("renders server validation errors and keeps attempted edits", async () => {
  await signInAs();
  await db.insert(notes).values({
    id: noteId,
    ownerId: testUser.id,
    title: "Reading list",
    content: "Books to read this quarter.",
  });

  await renderServer(<EditNotePage params={Promise.resolve({ id: noteId })} />, {
    route: "/notes/[id]/edit",
    url: `/notes/${noteId}/edit`,
  });

  await page.getByLabelText("Title").fill("");
  await page.getByLabelText("Content").fill("Changed body");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Changed body");
});
