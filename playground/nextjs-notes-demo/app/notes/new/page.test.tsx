import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signInAs } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renders the new note form with empty fields", async () => {
  await signInAs();
  await renderServer({ url: "/notes/new" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "New note" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("");
  await expect.element(page.getByLabelText("Content")).toHaveValue("");
  await expect.element(page.getByPlaceholder("A short, scannable title")).toBeInTheDocument();
  await expect.element(page.getByPlaceholder("Write something...")).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "All notes" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Create note" })).toBeInTheDocument();
});

test("renders server validation errors and keeps old input", async () => {
  await signInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Keep this body");
});

test("create note action redirects to the created note route", async () => {
  await signInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Redirected note");
  await page.getByLabelText("Content").fill("Created through the real app action.");
  await page.getByRole("button", { name: "Create note" }).click();

  const createdNote = await vi.waitFor(async () => {
    const [note] = await db.select().from(notes).where(eq(notes.title, "Redirected note"));
    expect(note).toBeDefined();
    return note;
  });
  if (!createdNote) throw new Error("Expected create note action to insert a note.");

  await vi.waitFor(() => expect(window.location.pathname).toBe(`/notes/${createdNote.id}`));
  await expect
    .element(page.getByRole("heading", { level: 1, name: "Redirected note" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Created through the real app action.")).toBeInTheDocument();
  await expect
    .element(page.getByRole("link", { name: "Edit" }))
    .toHaveAttribute("href", `/notes/${createdNote.id}/edit`);
});
