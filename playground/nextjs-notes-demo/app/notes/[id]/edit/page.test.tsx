import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { signInAs, testUser } from "#test/auth.ts";
import { AppShell } from "#app/layout.tsx";
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

  await renderServer(
    <AppShell>
      <EditNotePage params={Promise.resolve({ id: noteId })} />
    </AppShell>,
  );

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

  await renderServer(
    <AppShell>
      <EditNotePage params={Promise.resolve({ id: noteId })} />
    </AppShell>,
  );

  await userEvent.clear(page.getByLabelText("Title"));
  await userEvent.fill(page.getByLabelText("Content"), "Changed body");
  await userEvent.click(page.getByRole("button", { name: "Save changes" }));

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Changed body");
});
