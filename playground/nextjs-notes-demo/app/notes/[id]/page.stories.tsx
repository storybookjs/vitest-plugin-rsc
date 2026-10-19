import { expect } from "storybook/test";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { otherUser, signInAs, testUser } from "#test/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// The page of one note: see page.test.tsx.
const id = "00000000-0000-4000-8000-000000000001";
const updatedAt = new Date("2026-01-15T12:00:00.000Z");

const meta = preview.meta({
  parameters: { nextjs: { url: `/notes/${id}` } },
  beforeEach: () => signInAs(),
});

export const Note = meta.story({
  beforeEach: async () => {
    await db.insert(notes).values({
      id,
      ownerId: testUser.id,
      title: "Product roadmap Q3",
      content: "Ship offline sync first, then shared notebooks.\nRevisit pricing after the beta.",
      updatedAt,
    });
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Product roadmap Q3" }),
    ).toBeVisible();
    await expect(canvas.getByText("Updated Jan 15, 2026")).toBeVisible();
  },
});

export const Favorite = meta.story({
  beforeEach: async () => {
    await db.insert(notes).values({
      id,
      ownerId: testUser.id,
      title: "Team offsite agenda",
      content: "Day 1: retro and planning. Day 2: hack day, demos at four.",
      isFavorite: true,
      updatedAt,
    });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Unfavorite note" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
});

// A Server Action that deletes the note and redirects to the list.
export const Delete = meta.story({
  beforeEach: async () => {
    await db.insert(notes).values({ id, ownerId: testUser.id, title: "Short-lived", updatedAt });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Delete" }));
    await expect(await canvas.findByText("No notes yet", {}, roundTrip)).toBeVisible();
    await expect(location.pathname).toBe("/notes");
  },
});

// `notFound()` for an id that is no UUID: Next's own not-found page.
export const InvalidId = meta.story({
  parameters: { nextjs: { url: "/notes/not-a-note" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This page could not be found.")).toBeVisible();
  },
});

// The note of another user is not found either.
export const NotYours = meta.story({
  beforeEach: async () => {
    await signInAs(otherUser);
    await db.insert(notes).values({ id, ownerId: otherUser.id, title: "Private" });
    await signInAs(testUser);
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This page could not be found.")).toBeVisible();
  },
});
