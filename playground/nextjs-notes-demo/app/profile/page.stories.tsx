import { expect } from "storybook/test";
import { passkey, session } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signedInAs, testUser } from "#test/auth.ts";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// The profile of the user who is signed in, whose passkeys Better Auth
// reads from the database: see page.test.tsx.
const meta = preview.meta({
  parameters: { nextjs: { url: "/profile" } },
  beforeEach: () => signedInAs(),
});

// A passkey as Better Auth keeps it after a device registered it.
const registered = {
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
  beforeEach: async () => {
    await db.insert(passkey).values([
      {
        ...registered,
        name: "iPhone passkey",
        credentialID: "credential-1",
        createdAt: new Date("2026-02-14T10:00:00.000Z"),
      },
      {
        ...registered,
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

// A Server Action that signs out with Better Auth, which ends the session,
// and redirects to sign in.
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
    await expect(await db.select().from(session)).toEqual([]);
  },
});
