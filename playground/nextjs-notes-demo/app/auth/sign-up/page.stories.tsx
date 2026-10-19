import { expect } from "storybook/test";
import { auth } from "#lib/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// Signing up with a magic link of Better Auth, whose API is a mock: see
// page.test.tsx.
const meta = preview.meta({
  parameters: { nextjs: { url: "/auth/sign-up" } },
});

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Email")).toHaveValue("");
    await expect(canvas.getByRole("button", { name: "Create account" })).toBeEnabled();
  },
});

export const MagicLinkSent = meta.story({
  parameters: { nextjs: { url: "/auth/sign-up?sent=magic-link" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Check your inbox for the link to finish creating your account."),
    ).toBeVisible();
  },
});

// The error that the Server Action flashes, with what was typed kept.
export const InvalidEmail = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Email"), "not-an-email");
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }));
    await expect(
      await canvas.findByText("Enter a valid email address.", {}, roundTrip),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toHaveValue("not-an-email");
  },
});

// The Server Action asks Better Auth for a link, which a new user follows
// to set up a passkey.
export const CreateAccount = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Email"), "ada@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }));
    await expect(
      await canvas.findByText(
        "Check your inbox for the link to finish creating your account.",
        {},
        roundTrip,
      ),
    ).toBeVisible();
    await expect(auth.api.signInMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ newUserCallbackURL: "/profile?setup=passkey" }),
      }),
    );
  },
});
