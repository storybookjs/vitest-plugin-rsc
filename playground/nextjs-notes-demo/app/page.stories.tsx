import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";
import { signInAs, testUser } from "#test/auth.ts";

// The home page, in the root layout, whose header knows who is signed in.
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

// A `<Link>` of the page: Next's router loads the route in the same document.
export const OpenNotes: Story = {
  beforeEach: () => signInAs(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("link", { name: "Open notes" }));
    await expect(await canvas.findByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
    await expect(location.pathname).toBe("/notes");
  },
};
