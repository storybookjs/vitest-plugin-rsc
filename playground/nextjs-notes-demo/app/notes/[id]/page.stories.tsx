import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { otherUser, signInAs, testUser } from "#test/auth.ts";

// The page of one note: see page.test.tsx.
const id = "00000000-0000-4000-8000-000000000001";
const updatedAt = new Date("2026-01-15T12:00:00.000Z");

export default {
  title: "Pages/Note",
  parameters: { nextjs: { url: `/notes/${id}` } },
  beforeEach: () => signInAs(),
} satisfies Meta;

type Story = StoryObj;

export const Note: Story = {
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
};

export const Favorite: Story = {
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
};

// A Server Action that deletes the note and redirects to the list.
export const Delete: Story = {
  beforeEach: async () => {
    await db.insert(notes).values([
      { id, ownerId: testUser.id, title: "Short-lived", updatedAt },
      { ownerId: testUser.id, title: "Still here", updatedAt },
    ]);
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Delete" }));
    await expect(await canvas.findByText("Still here")).toBeVisible();
    await expect(location.pathname).toBe("/notes");
    await expect(canvas.queryByText("Short-lived")).toBeNull();
  },
};

// `notFound()` for an id that is no UUID: Next's own not-found page.
export const InvalidId: Story = {
  parameters: { nextjs: { url: "/notes/not-a-note" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This page could not be found.")).toBeVisible();
  },
};

// The note of another user is not found either.
export const NotYours: Story = {
  beforeEach: async () => {
    await signInAs(otherUser);
    await db.insert(notes).values({ id, ownerId: otherUser.id, title: "Private" });
    await signInAs(testUser);
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This page could not be found.")).toBeVisible();
  },
};
