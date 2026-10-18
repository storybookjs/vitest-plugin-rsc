import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect, waitFor } from "storybook/test";
import { signInAs, testUser } from "#test/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";

// The home page, in the root layout, whose header knows who is signed in.
// No `autodocs` for the pages: a docs page shows a server story in an
// iframe 320px high, where a whole route says little. The stories of
// components/ have docs pages.
export default {
  title: "Pages/Home",
  parameters: { nextjs: { url: "/" } },
} satisfies Meta;

type Story = StoryObj;

export const SignedOut: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Log in" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sign up" })).toBeVisible();
  },
};

export const SignedIn: Story = {
  beforeEach: () => signInAs(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: `Signed in as ${testUser.email}, open profile` }),
    ).toBeVisible();
  },
};

// The theme toggle of the root layout. Its menu opens in a portal, outside
// of the page's `<main>`: `canvas` is the page's `<body>`, which has it.
export const DarkMode: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Toggle theme" }));
    await userEvent.click(await canvas.findByRole("menuitem", { name: "Dark" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  },
};

// A `<Link>` of the page: Next's router loads the route in the same document.
export const OpenNotes: Story = {
  beforeEach: () => signInAs(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("link", { name: "Open notes" }));
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Notes" }, roundTrip),
    ).toBeVisible();
    await expect(location.pathname).toBe("/notes");
  },
};
