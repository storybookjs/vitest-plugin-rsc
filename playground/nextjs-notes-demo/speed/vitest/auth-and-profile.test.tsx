import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { passkey } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signedInAs, testUser } from "#test/auth.ts";

// Signing in and the profile. One for one with
// speed/playwright/auth-and-profile.spec.ts.

test("renders the sign-in form", async () => {
  await renderServer({ url: "/auth/sign-in" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Continue with email" }))
    .toBeInTheDocument();
});

test("renders an inline error when the email is invalid", async () => {
  await renderServer({ url: "/auth/sign-in" });

  await page.getByLabelText("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Continue with email" }).click();

  await expect.element(page.getByText("Enter a valid email address.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
});

test("sends a visitor without a session to sign in", async () => {
  await renderServer({ url: "/notes" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }))
    .toBeInTheDocument();
});

test("shows the email of the user and that they have no passkeys", async () => {
  await signedInAs();
  await renderServer({ url: "/profile" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Profile" }))
    .toBeInTheDocument();
  await expect.element(page.getByText(`Signed in as ${testUser.email}.`)).toBeInTheDocument();
  await expect.element(page.getByText("No passkeys yet")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

test("lists the passkeys of the user with their dates", async () => {
  await signedInAs();
  const registered = {
    userId: testUser.id,
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

  await renderServer({ url: "/profile" });

  await expect.element(page.getByText("iPhone passkey")).toBeInTheDocument();
  await expect.element(page.getByText("Added Feb 14, 2026")).toBeInTheDocument();
  await expect.element(page.getByText("Work laptop")).toBeInTheDocument();
  await expect.element(page.getByText("Added Mar 20, 2026")).toBeInTheDocument();
});
