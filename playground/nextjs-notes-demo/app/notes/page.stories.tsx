import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { eq } from "drizzle-orm";
import { expect, waitFor, within } from "storybook/test";
import { seedNotes } from "#.storybook/sample-notes.ts";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signInAs, signOut, testUser } from "#test/auth.ts";

// The list of notes. A story file is server code, so the `db` it seeds is the
// one the page reads: see page.test.tsx.
export default {
  title: "Pages/Notes",
  parameters: { nextjs: { url: "/notes" } },
  beforeEach: () => signInAs(),
} satisfies Meta;

type Story = StoryObj;

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No notes yet")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Create your first note" })).toBeVisible();
  },
};

// A page has no props: `count` is an input of `beforeEach`, which seeds the
// database before the request. A new value in Controls loads the page again.
export const WithNotes: StoryObj<{ count: number }> = {
  args: { count: 5 },
  argTypes: { count: { control: { type: "range", min: 0, max: 24 } } },
  beforeEach: async ({ args }) => {
    await seedNotes(testUser.id, args.count);
  },
  play: async ({ args, canvas }) => {
    const total = `${args.count} ${args.count === 1 ? "note" : "notes"}`;
    const favorited = Math.min(args.count, 2);
    await expect(
      await canvas.findByText(
        args.count ? `${total} · ${favorited} favorited` : "Start by creating your first note.",
      ),
    ).toBeVisible();
  },
};

// The theme toggle of the layout. Its menu opens in a portal, outside of the
// page's `<main>`: `canvas` is the page's `<body>`, which has it.
export const DarkMode: Story = {
  beforeEach: async () => {
    await seedNotes(testUser.id, 3);
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Toggle theme" }));
    await userEvent.click(await canvas.findByRole("menuitem", { name: "Dark" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  },
};

// A Server Action that writes to the database and refreshes the page.
export const ToggleFavorite: Story = {
  beforeEach: async () => {
    await db.insert(notes).values({ ownerId: testUser.id, title: "Book recommendations" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Favorite note" }));
    await expect(await canvas.findByRole("button", { name: "Unfavorite note" })).toBeVisible();
    const [note] = await db.select().from(notes).where(eq(notes.title, "Book recommendations"));
    await expect(note?.isFavorite).toBe(true);
  },
};

export const DeleteNote: Story = {
  beforeEach: async () => {
    await db.insert(notes).values([
      { ownerId: testUser.id, title: "Team offsite agenda" },
      { ownerId: testUser.id, title: "Old meeting notes" },
    ]);
  },
  play: async ({ canvas, userEvent }) => {
    const row = within((await canvas.findByText("Old meeting notes")).closest("li")!);
    await userEvent.click(row.getByRole("button", { name: "Delete note" }));
    await waitFor(() => expect(canvas.queryByText("Old meeting notes")).toBeNull());
    await expect(await db.select().from(notes)).toHaveLength(1);
  },
};

// `requireUser()` sends a visitor without a session to sign in.
export const SignedOut: Story = {
  beforeEach: signOut,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }),
    ).toBeVisible();
    await expect(location.pathname).toBe("/auth/sign-in");
  },
};
