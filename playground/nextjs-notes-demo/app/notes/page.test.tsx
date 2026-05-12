import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { page } from "vitest/browser";
import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { applyScenario, scenarioUsers } from "#lib/db.scenarios.ts";
import { otherUser, signInAs, testUser } from "#test/auth.ts";
import { renderServer } from "#test/render.tsx";
import NotesPage from "./page.tsx";

async function renderNotesPage() {
  await signInAs();
  await renderServer(<NotesPage />, { url: "/notes" });
}

test("renders Notes heading", async () => {
  await renderNotesPage();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
});

test("shows empty state when no notes exist", async () => {
  await renderNotesPage();
  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
  await expect
    .element(page.getByText("Capture an idea, a todo, or a thought."))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("link", { name: "Create your first note" }))
    .toBeInTheDocument();
});

test("renders notes from the database", async () => {
  await applyScenario(db, "notes-basic");
  await signInAs({
    ...testUser,
    id: scenarioUsers.notesOwner.id,
    name: scenarioUsers.notesOwner.name,
    email: scenarioUsers.notesOwner.email,
    emailVerified: scenarioUsers.notesOwner.emailVerified,
    role: scenarioUsers.notesOwner.role,
  });
  const seededNotes = await db.select().from(notes);

  await renderServer(<NotesPage />, { url: "/notes" });

  for (const note of seededNotes) {
    await expect.element(page.getByText(note.title)).toBeInTheDocument();
  }
});

test("lists favorite notes before non-favorites", async () => {
  await signInAs();
  await db.insert(notes).values([
    {
      ownerId: testUser.id,
      title: "Older favorite",
      isFavorite: true,
      updatedAt: new Date("2026-01-01"),
    },
    {
      ownerId: testUser.id,
      title: "Newest regular",
      isFavorite: false,
      updatedAt: new Date("2026-03-01"),
    },
    {
      ownerId: testUser.id,
      title: "Newer favorite",
      isFavorite: true,
      updatedAt: new Date("2026-02-01"),
    },
  ]);

  await renderServer(<NotesPage />, { url: "/notes" });

  await expect.element(page.getByText("Newer favorite")).toBeInTheDocument();
  await expect
    .poll(() =>
      page
        .getByRole("heading", { level: 2 })
        .elements()
        .map((el) => el.textContent ?? ""),
    )
    .toEqual(["Newer favorite", "Older favorite", "Newest regular"]);
});

test("favorite toggle updates stored favorite state", async () => {
  await signInAs();
  const [inserted] = await db
    .insert(notes)
    .values({ ownerId: testUser.id, title: "Toggle me", isFavorite: false })
    .returning({ id: notes.id });
  if (!inserted) throw new Error("Failed to insert note");

  await renderNotesPage();

  const toggle = page.getByRole("button", { name: "Favorite note" });
  await expect.element(toggle).toBeInTheDocument();
  await toggle.click();

  await expect
    .poll(async () => {
      const [row] = await db.select().from(notes).where(eq(notes.id, inserted.id));
      return row?.isFavorite;
    })
    .toBe(true);
  await expect.element(page.getByRole("button", { name: "Unfavorite note" })).toBeInTheDocument();
});

test("only renders notes owned by the current user", async () => {
  await signInAs();
  await signInAs(otherUser);
  await signInAs(testUser);
  await db.insert(notes).values([
    { ownerId: testUser.id, title: "Mine", content: "Visible" },
    { ownerId: otherUser.id, title: "Not mine", content: "Hidden" },
  ]);

  await renderServer(<NotesPage />, { url: "/notes" });

  await expect.element(page.getByText("Mine")).toBeInTheDocument();
  await expect.element(page.getByText("Not mine")).not.toBeInTheDocument();
});
