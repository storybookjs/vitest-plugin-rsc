import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signInAs } from "#test/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";

// The form for a new note, whose Server Action validates on the server: see
// page.test.tsx.
export default {
  title: "Pages/New note",
  parameters: { nextjs: { url: "/notes/new" } },
  beforeEach: () => signInAs(),
} satisfies Meta;

type Story = StoryObj;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Title")).toHaveValue("");
    await expect(canvas.getByRole("button", { name: "Create note" })).toBeEnabled();
  },
};

// The error that the Server Action flashes, with what was typed kept.
export const ValidationError: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Content"), "Keep this body");
    await userEvent.click(canvas.getByRole("button", { name: "Create note" }));
    await expect(await canvas.findByText("Title is required.", {}, roundTrip)).toBeVisible();
    await expect(canvas.getByLabelText("Content")).toHaveValue("Keep this body");
  },
};

// The Server Action inserts the note and redirects to its page.
export const Create: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Title"), "Weekend plan");
    await userEvent.click(canvas.getByRole("button", { name: "Create note" }));
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Weekend plan" }, roundTrip),
    ).toBeVisible();
    const [note] = await db.select().from(notes);
    await expect(location.pathname).toBe(`/notes/${note!.id}`);
  },
};
