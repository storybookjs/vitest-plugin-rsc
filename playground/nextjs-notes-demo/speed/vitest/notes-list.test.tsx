import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { notes, user } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { otherUser, signedInAs, testUser } from "#test/auth.ts";

// The notes list. One for one with speed/playwright/notes-list.spec.ts.

test("renders the Notes heading", async () => {
  await signedInAs();
  await renderServer({ url: "/notes" });

  await expect.element(page.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "New note" }).first()).toBeInTheDocument();
});

test("shows the empty state when the user has no notes", async () => {
  await signedInAs();
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
  await expect
    .element(page.getByRole("link", { name: "Create your first note" }))
    .toBeInTheDocument();
});

test("renders the notes of the database", async () => {
  await signedInAs();
  await db.insert(notes).values([
    { ownerId: testUser.id, title: "Roadmap", content: "Ship it" },
    { ownerId: testUser.id, title: "Groceries", content: "Oat milk" },
    { ownerId: testUser.id, title: "Reading list", content: "Shape Up" },
  ]);

  await renderServer({ url: "/notes" });

  await expect
    .element(page.getByRole("heading", { level: 2, name: "Roadmap" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("heading", { level: 2, name: "Groceries" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("heading", { level: 2, name: "Reading list" }))
    .toBeInTheDocument();
});

test("lists favorite notes before the others", async () => {
  await signedInAs();
  await db.insert(notes).values([
    {
      ownerId: testUser.id,
      title: "Older favorite",
      isFavorite: true,
      updatedAt: new Date("2026-01-01"),
    },
    { ownerId: testUser.id, title: "Newest regular", updatedAt: new Date("2026-03-01") },
    {
      ownerId: testUser.id,
      title: "Newer favorite",
      isFavorite: true,
      updatedAt: new Date("2026-02-01"),
    },
  ]);

  await renderServer({ url: "/notes" });

  await expect
    .element(page.getByRole("heading", { level: 2, name: "Newer favorite" }))
    .toBeInTheDocument();
  await expect
    .poll(() =>
      page
        .getByRole("heading", { level: 2 })
        .elements()
        .map((element) => element.textContent),
    )
    .toEqual(["Newer favorite", "Older favorite", "Newest regular"]);
});

test("renders only the notes of the user", async () => {
  await signedInAs();
  await db.insert(user).values(otherUser);
  await db.insert(notes).values([
    { ownerId: testUser.id, title: "Mine" },
    { ownerId: otherUser.id, title: "Not mine" },
  ]);

  await renderServer({ url: "/notes" });

  await expect.element(page.getByRole("heading", { level: 2, name: "Mine" })).toBeInTheDocument();
  await expect
    .element(page.getByRole("heading", { level: 2, name: "Not mine" }))
    .not.toBeInTheDocument();
});
