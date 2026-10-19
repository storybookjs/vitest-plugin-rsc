import { expect } from "storybook/test";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// Signing in with a magic link of Better Auth. No story sends one: a
// static build of Storybook is a production build, where the app needs
// Resend to send mail, and stops without it. page.test.tsx sends a link
// and follows it.
const meta = preview.meta({
  parameters: { nextjs: { url: "/auth/sign-in" } },
});

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Email")).toHaveValue("");
    await expect(canvas.getByRole("button", { name: "Continue with email" })).toBeEnabled();
  },
});

export const MagicLinkSent = meta.story({
  parameters: { nextjs: { url: "/auth/sign-in?sent=magic-link" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Check your inbox for the sign-in link.")).toBeVisible();
  },
});

export const MagicLinkFailed = meta.story({
  parameters: { nextjs: { url: "/auth/sign-in?error=magic" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "We couldn’t send your sign-in link.",
    );
  },
});

// The error that the Server Action flashes, with what was typed kept.
export const InvalidEmail = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Email"), "not-an-email");
    await userEvent.click(canvas.getByRole("button", { name: "Continue with email" }));
    await expect(
      await canvas.findByText("Enter a valid email address.", {}, roundTrip),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toHaveValue("not-an-email");
  },
});
