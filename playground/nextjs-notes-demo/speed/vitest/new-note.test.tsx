import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signedInAs, testUser } from "#test/auth.ts";

// The form of a new note. One for one with speed/playwright/new-note.spec.ts.

test("renders the form with empty fields", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "New note" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("");
  await expect.element(page.getByLabelText("Content")).toHaveValue("");
  await expect.element(page.getByRole("button", { name: "Create note" })).toBeInTheDocument();
});

test("creates a note and opens it", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByLabelText("Content").fill("Oat milk, sourdough");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Groceries" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Oat milk, sourdough")).toBeInTheDocument();
  const rows = await db.select().from(notes).where(eq(notes.ownerId, testUser.id));
  expect(rows.map((row) => row.title)).toEqual(["Groceries"]);
});

test("renders the errors of the server and keeps the input", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Keep this body");
});

test("shows the flashed errors once, not on a later visit", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();

  await page.getByRole("link", { name: "All notes" }).click();
  await expect.element(page.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
  await page.getByRole("link", { name: "New note" }).first().click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "New note" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Title is required.")).not.toBeInTheDocument();
  await expect.element(page.getByLabelText("Content")).toHaveValue("");
});

test("cancels back to the list", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByRole("link", { name: "Cancel" }).click();

  await expect.element(page.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
});
