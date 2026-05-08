import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { AppShell } from "#app/layout.tsx";
import { auth } from "#lib/auth.ts";
import { signInAs, testUser } from "#test/auth.ts";
import ProfilePage from "./page.tsx";

const noSearchParams = Promise.resolve({});

test("shows the empty passkeys hint when the user has none", async () => {
  await signInAs();

  await renderServer(
    <AppShell>
      <ProfilePage searchParams={noSearchParams} />
    </AppShell>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Profile" }))
    .toBeInTheDocument();
  await expect.element(page.getByText(`Signed in as ${testUser.email}.`)).toBeInTheDocument();
  await expect.element(page.getByText("No passkeys yet")).toBeInTheDocument();
  await expect.element(page.getByText("Add one to sign in without email.")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: /Add passkey/ })).toBeInTheDocument();
});

test("shows account email on profile", async () => {
  await signInAs();

  await renderServer(
    <AppShell>
      <ProfilePage searchParams={noSearchParams} />
    </AppShell>,
  );

  await expect.element(page.getByText(testUser.email)).toBeInTheDocument();
});

test("renders a sign-out button", async () => {
  await signInAs();

  await renderServer(
    <AppShell>
      <ProfilePage searchParams={noSearchParams} />
    </AppShell>,
  );

  await expect.element(page.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

test("lists existing passkeys with their creation dates", async () => {
  await signInAs();
  vi.mocked(auth.api.listPasskeys).mockResolvedValueOnce([
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "iPhone passkey",
      createdAt: new Date("2026-02-14T10:00:00.000Z"),
      publicKey: "pk1",
      userId: testUser.id,
      credentialID: "credential-1",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: true,
      transports: "internal",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Work laptop",
      createdAt: new Date("2026-03-20T10:00:00.000Z"),
      publicKey: "pk2",
      userId: testUser.id,
      credentialID: "credential-2",
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      transports: "internal",
    },
  ]);

  await renderServer(
    <AppShell>
      <ProfilePage searchParams={noSearchParams} />
    </AppShell>,
  );

  await expect.element(page.getByText("iPhone passkey")).toBeInTheDocument();
  await expect.element(page.getByText("Added Feb 14, 2026")).toBeInTheDocument();
  await expect.element(page.getByText("Work laptop")).toBeInTheDocument();
  await expect.element(page.getByText("Added Mar 20, 2026")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Delete" }).nth(1)).toBeInTheDocument();
});

test("renders the passkey setup hero after first sign-in", async () => {
  await signInAs();

  await renderServer(
    <AppShell>
      <ProfilePage searchParams={Promise.resolve({ setup: "passkey" })} />
    </AppShell>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Add a passkey" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(`Finish setting up passwordless sign-in for ${testUser.email}.`))
    .toBeInTheDocument();
  await expect.element(page.getByText("Your account is ready.")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: /Add passkey/ })).toBeInTheDocument();
});
