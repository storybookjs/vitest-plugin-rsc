import { expect } from "storybook/test";
import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signInAs, testUser } from "#test/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// The form of a note, filled from the database: see page.test.tsx.
const id = "00000000-0000-4000-8000-000000000001";

const meta = preview.meta({
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
});

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Title")).toHaveValue("Reading list");
    await expect(canvas.getByLabelText("Content")).toHaveValue("Books to read this quarter.");
  },
});

// The error that the Server Action flashes.
export const ValidationError = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.clear(await canvas.findByLabelText("Title"));
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("Title is required.", {}, roundTrip)).toBeVisible();
    await expect(canvas.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  },
});

// The Server Action updates the note and redirects to its page.
export const Save = meta.story({
  play: async ({ canvas, userEvent }) => {
    const title = await canvas.findByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Reading list 2026");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Reading list 2026" }, roundTrip),
    ).toBeVisible();
    await expect(location.pathname).toBe(`/notes/${id}`);
  },
});
