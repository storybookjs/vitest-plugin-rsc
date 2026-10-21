import { expect, waitFor } from "storybook/test";
import { signedInAs, testUser } from "#test/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// The home page, in the root layout, whose header knows who is signed in.
const meta = preview.meta({
  parameters: { nextjs: { url: "/" } },
});

export const SignedOut = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Log in" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sign up" })).toBeVisible();
  },
});

// The support address, which the page's server code reads from .env.test.
export const SupportAddress = meta.story({
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "support@notes.example" }),
    ).toHaveAttribute("href", "mailto:support@notes.example");
  },
});

export const SignedIn = meta.story({
  beforeEach: () => signedInAs(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: `Signed in as ${testUser.email}, open profile` }),
    ).toBeVisible();
  },
});

// The theme toggle of the root layout. Its menu opens in a portal, outside
// of the page's `<main>`: `canvas` is the page's `<body>`, which has it.
export const DarkMode = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Toggle theme" }));
    await userEvent.click(await canvas.findByRole("menuitem", { name: "Dark" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  },
});

// A `<Link>` of the page: Next's router loads the route in the same document.
export const OpenNotes = meta.story({
  beforeEach: () => signedInAs(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("link", { name: "Open notes" }));
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Notes" }, roundTrip),
    ).toBeVisible();
    await expect(location.pathname).toBe("/notes");
  },
});
