import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";
import { auth } from "#lib/auth.ts";

// Signing up with a magic link of Better Auth, whose API is a mock: see
// page.test.tsx.
export default {
  title: "Pages/Sign up",
  parameters: { nextjs: { url: "/auth/sign-up" } },
} satisfies Meta;

type Story = StoryObj;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Email")).toHaveValue("");
    await expect(canvas.getByRole("button", { name: "Create account" })).toBeEnabled();
  },
};

export const MagicLinkSent: Story = {
  parameters: { nextjs: { url: "/auth/sign-up?sent=magic-link" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Check your inbox for the link to finish creating your account."),
    ).toBeVisible();
  },
};

// The error that the Server Action flashes, with what was typed kept.
export const InvalidEmail: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Email"), "not-an-email");
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }));
    await expect(await canvas.findByText("Enter a valid email address.")).toBeVisible();
  },
};

// The Server Action asks Better Auth for a link, which a new user follows
// to set up a passkey.
export const CreateAccount: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Email"), "ada@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }));
    await expect(
      await canvas.findByText("Check your inbox for the link to finish creating your account."),
    ).toBeVisible();
    await expect(auth.api.signInMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ newUserCallbackURL: "/profile?setup=passkey" }),
      }),
    );
  },
};
