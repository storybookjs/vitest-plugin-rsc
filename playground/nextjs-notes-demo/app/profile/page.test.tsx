import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { passkey } from "#db/schema.ts";
import { db } from "#lib/db.ts";
import { signedInAs, testUser } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("shows the empty passkeys hint when the user has none", async () => {
  await signedInAs();

  await renderServer({ url: "/profile" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Profile" }))
    .toBeInTheDocument();
  await expect.element(page.getByText(`Signed in as ${testUser.email}.`)).toBeInTheDocument();
  await expect.element(page.getByText("No passkeys yet")).toBeInTheDocument();
  await expect.element(page.getByText("Add one to sign in without email.")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: /Add passkey/ })).toBeInTheDocument();
});

test("shows account email on profile", async () => {
  await signedInAs();

  await renderServer({ url: "/profile" });

  await expect.element(page.getByText(`Signed in as ${testUser.email}.`)).toBeInTheDocument();
});

test("renders a sign-out button", async () => {
  await signedInAs();

  await renderServer({ url: "/profile" });

  await expect.element(page.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

test("lists existing passkeys with their creation dates", async () => {
  await signedInAs();
  // Two passkeys as Better Auth keeps them after a device registered them.
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
  await expect.element(page.getByRole("button", { name: "Delete" }).nth(1)).toBeInTheDocument();
});

test("renders the passkey setup hero after first sign-in", async () => {
  await signedInAs();

  await renderServer({ url: "/profile?setup=passkey" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Add a passkey" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(`Finish setting up passwordless sign-in for ${testUser.email}.`))
    .toBeInTheDocument();
  await expect.element(page.getByText("Your account is ready.")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: /Add passkey/ })).toBeInTheDocument();
});
