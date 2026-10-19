import { expect, mocked } from "storybook/test";
import { auth } from "#lib/auth.ts";
import { signInAs, testUser } from "#test/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// The profile, whose passkeys come from Better Auth: a story says what the
// mock of `auth.api` answers, see lib/__mocks__/auth.ts and page.test.tsx.
const meta = preview.meta({
  parameters: { nextjs: { url: "/profile" } },
  beforeEach: () => signInAs(),
});

const passkey = {
  publicKey: "pk",
  userId: testUser.id,
  counter: 0,
  deviceType: "multiDevice",
  backedUp: true,
  transports: "internal",
} as const;

export const NoPasskeys = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No passkeys yet")).toBeVisible();
  },
});

export const WithPasskeys = meta.story({
  beforeEach: () => {
    mocked(auth.api.listPasskeys).mockResolvedValue([
      {
        ...passkey,
        id: "11111111-1111-4111-8111-111111111111",
        name: "iPhone passkey",
        credentialID: "credential-1",
        createdAt: new Date("2026-02-14T10:00:00.000Z"),
      },
      {
        ...passkey,
        id: "22222222-2222-4222-8222-222222222222",
        name: "Work laptop",
        credentialID: "credential-2",
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
      },
    ]);
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("iPhone passkey")).toBeVisible();
    await expect(canvas.getByText("Added Mar 20, 2026")).toBeVisible();
  },
});

// After the first sign-in, the magic link opens the profile with this query.
export const PasskeySetup = meta.story({
  parameters: { nextjs: { url: "/profile?setup=passkey" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Add a passkey" }),
    ).toBeVisible();
  },
});

// A Server Action that signs out with Better Auth and redirects to sign in.
export const SignOut = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Sign out" }));
    await expect(
      await canvas.findByRole(
        "heading",
        { level: 1, name: "Welcome back to Notes Demo" },
        roundTrip,
      ),
    ).toBeVisible();
    await expect(auth.api.signOut).toHaveBeenCalledOnce();
  },
});
