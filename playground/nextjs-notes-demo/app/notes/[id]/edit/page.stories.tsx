import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signInAs, testUser } from "#test/auth.ts";

// The form of a note, filled from the database: see page.test.tsx.
const id = "00000000-0000-4000-8000-000000000001";

export default {
  title: "Pages/Edit note",
  parameters: { nextjs: { url: `/notes/${id}/edit` } },
  beforeEach: async () => {
    await signInAs();
    await db.insert(notes).values({
      id,
      ownerId: testUser.id,
      title: "Reading list",
      content: "Books to read this quarter.",
    });
  },
} satisfies Meta;

type Story = StoryObj;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Title")).toHaveValue("Reading list");
    await expect(canvas.getByLabelText("Content")).toHaveValue("Books to read this quarter.");
  },
};

// The error that the Server Action flashes, with the edits kept.
export const ValidationError: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.clear(await canvas.findByLabelText("Title"));
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("Title is required.")).toBeVisible();
    await expect(canvas.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  },
};

// The Server Action updates the note and redirects to its page.
export const Save: Story = {
  play: async ({ canvas, userEvent }) => {
    const title = await canvas.findByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Reading list 2026");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Reading list 2026" }),
    ).toBeVisible();
    await expect(location.pathname).toBe(`/notes/${id}`);
  },
};
