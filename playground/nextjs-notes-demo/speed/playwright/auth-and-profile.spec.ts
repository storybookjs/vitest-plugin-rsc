import { passkey } from "#db/schema.ts";
import { db, expect, test } from "./app.ts";

// Signing in and the profile. One for one with
// speed/vitest/auth-and-profile.test.tsx.

test("renders the sign-in form", async ({ page }) => {
  await page.goto("/auth/sign-in");

  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
});

test("renders an inline error when the email is invalid", async ({ page }) => {
  await page.goto("/auth/sign-in");

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Continue with email" }).click();

  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
});

test("sends a visitor without a session to sign in", async ({ page }) => {
  await page.goto("/notes");

  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }),
  ).toBeVisible();
});

test("shows the email of the user and that they have no passkeys", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/profile");

  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${user.email}.`)).toBeVisible();
  await expect(page.getByText("No passkeys yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("lists the passkeys of the user with their dates", async ({ page, signedIn }) => {
  const user = await signedIn();
  const registered = {
    userId: user.id,
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
    transports: "internal",
  };
  await db.insert(passkey).values([
    {
      ...registered,
      name: "iPhone passkey",
      publicKey: "pk1",
      credentialID: "credential-1",
      createdAt: new Date("2026-02-14T10:00:00.000Z"),
    },
    {
      ...registered,
      name: "Work laptop",
      publicKey: "pk2",
      credentialID: "credential-2",
      createdAt: new Date("2026-03-20T10:00:00.000Z"),
    },
  ]);

  await page.goto("/profile");

  await expect(page.getByText("iPhone passkey")).toBeVisible();
  await expect(page.getByText("Added Feb 14, 2026")).toBeVisible();
  await expect(page.getByText("Work laptop")).toBeVisible();
  await expect(page.getByText("Added Mar 20, 2026")).toBeVisible();
});
