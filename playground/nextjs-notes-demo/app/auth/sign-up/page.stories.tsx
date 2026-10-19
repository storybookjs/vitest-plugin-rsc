import { expect } from "storybook/test";
import { verification } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// Signing up with a magic link of Better Auth. Without Resend the app
// logs the mail, so a story sends nothing over the network: page.test.tsx
// follows the link.
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

// The Server Action asks Better Auth for a link, which it keeps in the
// database: a new user who follows it sets up a passkey.
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
    const [link] = await db.select().from(verification);
    await expect(JSON.parse(link!.value)).toMatchObject({ email: "ada@example.com" });
  },
});
