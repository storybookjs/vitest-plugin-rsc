import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { signInAs, testUser } from "#test/auth.ts";
import { renderServer } from "#test/render.tsx";
import NotePage from "./page.tsx";

const noteId = "00000000-0000-4000-8000-000000000001";
const databaseGeneratedNoteId = "70458a4b-ecef-4a2a-00e1-53f5b00c951e";
const updatedAt = new Date("2026-01-15T12:00:00.000Z");

test("renders the note title and content with metadata", async () => {
  await signInAs();
  await db.insert(notes).values({
    id: noteId,
    ownerId: testUser.id,
    title: "Roadmap thoughts",
    content: "Phasellus ultricies suscipit lacus,\nat faucibus est varius ac.",
    updatedAt,
  });

  await renderServer(<NotePage params={Promise.resolve({ id: noteId })} />, {
    route: "/notes/[id]",
    url: `/notes/${noteId}`,
  });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Roadmap thoughts" }))
    .toBeInTheDocument();
  await expect.element(page.getByText(/Updated Jan 15, 2026/)).toBeInTheDocument();
  await expect.element(page.getByText(/Phasellus ultricies suscipit lacus,/)).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "All notes" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Edit" })).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Delete" })).toBeInTheDocument();
});

test("renders note when id matches database-stored uuid", async () => {
  await signInAs();
  await db.insert(notes).values({
    id: databaseGeneratedNoteId,
    ownerId: testUser.id,
    title: "Seeded note",
    content: "This ID came from local scenario data.",
    updatedAt,
  });

  await renderServer(<NotePage params={Promise.resolve({ id: databaseGeneratedNoteId })} />, {
    route: "/notes/[id]",
    url: `/notes/${databaseGeneratedNoteId}`,
  });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Seeded note" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("This ID came from local scenario data."))
    .toBeInTheDocument();
});

test("shows an empty content placeholder when the note has no body", async () => {
  await signInAs();
  await db.insert(notes).values({
    id: noteId,
    ownerId: testUser.id,
    title: "Empty",
    content: "",
    updatedAt,
  });

  await renderServer(<NotePage params={Promise.resolve({ id: noteId })} />, {
    route: "/notes/[id]",
    url: `/notes/${noteId}`,
  });

  await expect.element(page.getByText("No content yet.")).toBeInTheDocument();
});

test("renders the favorite badge for favorited notes", async () => {
  await signInAs();
  await db.insert(notes).values({
    id: noteId,
    ownerId: testUser.id,
    title: "Starred idea",
    content: "Worth keeping at the top of the list.",
    isFavorite: true,
    updatedAt,
  });

  await renderServer(<NotePage params={Promise.resolve({ id: noteId })} />, {
    route: "/notes/[id]",
    url: `/notes/${noteId}`,
  });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Starred idea" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Favorite")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Unfavorite note" })).toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Unfavorite note" }))
    .toHaveAttribute("aria-pressed", "true");
});
