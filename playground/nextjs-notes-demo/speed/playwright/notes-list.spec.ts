import { notes, user as userTable } from "#db/schema.ts";
import { db, expect, test } from "./app.ts";

// The notes list. One for one with speed/vitest/notes-list.test.tsx.

test("renders the Notes heading", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New note" }).first()).toBeVisible();
});

test("shows the empty state when the user has no notes", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/notes");

  await expect(page.getByText("No notes yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your first note" })).toBeVisible();
});

test("renders the notes of the database", async ({ page, signedIn }) => {
  const user = await signedIn();
  await db.insert(notes).values([
    { ownerId: user.id, title: "Roadmap", content: "Ship it" },
    { ownerId: user.id, title: "Groceries", content: "Oat milk" },
    { ownerId: user.id, title: "Reading list", content: "Shape Up" },
  ]);

  await page.goto("/notes");

  await expect(page.getByRole("heading", { level: 2, name: "Roadmap" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Groceries" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Reading list" })).toBeVisible();
});

test("lists favorite notes before the others", async ({ page, signedIn }) => {
  const user = await signedIn();
  await db.insert(notes).values([
    {
      ownerId: user.id,
      title: "Older favorite",
      isFavorite: true,
      updatedAt: new Date("2026-01-01"),
    },
    { ownerId: user.id, title: "Newest regular", updatedAt: new Date("2026-03-01") },
    {
      ownerId: user.id,
      title: "Newer favorite",
      isFavorite: true,
      updatedAt: new Date("2026-02-01"),
    },
  ]);

  await page.goto("/notes");

  await expect(page.getByRole("heading", { level: 2, name: "Newer favorite" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Newer favorite",
    "Older favorite",
    "Newest regular",
  ]);
});

test("renders only the notes of the user", async ({ page, signedIn }) => {
  const user = await signedIn();
  const other = await insertOtherUser();
  await db.insert(notes).values([
    { ownerId: user.id, title: "Mine" },
    { ownerId: other, title: "Not mine" },
  ]);

  await page.goto("/notes");

  await expect(page.getByRole("heading", { level: 2, name: "Mine" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Not mine" })).toHaveCount(0);
});

/** Another user, as `otherUser` of test/auth.ts, with an id of their own. */
async function insertOtherUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insert(userTable)
    .values({ id, name: "Other User", email: `${id}@example.com`, emailVerified: true });
  return id;
}
