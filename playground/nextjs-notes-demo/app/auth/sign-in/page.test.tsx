import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { AppShell } from "#app/layout.tsx";
import SignInPage from "./page.tsx";

test("renders sign-in form with email, passkey, and link to sign up", async () => {
  await renderServer(
    <AppShell>
      <SignInPage searchParams={Promise.resolve({})} />
    </AppShell>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Continue with email" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Sign in with a passkey" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("main").getByRole("link", { name: "Sign up" }))
    .toHaveAttribute("href", "/auth/sign-up");
});

test("shows the magic link sent confirmation banner", async () => {
  await renderServer(
    <AppShell>
      <SignInPage searchParams={Promise.resolve({ sent: "magic-link" })} />
    </AppShell>,
  );

  await expect
    .element(page.getByText("Check your inbox for the sign-in link."))
    .toBeInTheDocument();
});

test("shows the magic link error banner", async () => {
  await renderServer(
    <AppShell>
      <SignInPage searchParams={Promise.resolve({ error: "magic" })} />
    </AppShell>,
  );

  await expect
    .element(page.getByText("We couldn’t send your sign-in link. Please try again."))
    .toBeInTheDocument();
});

test("renders an inline error when the email is invalid", async () => {
  await renderServer(
    <AppShell>
      <SignInPage searchParams={Promise.resolve({})} />
    </AppShell>,
  );

  await userEvent.fill(page.getByLabelText("Email"), "not-an-email");
  await userEvent.click(page.getByRole("button", { name: "Continue with email" }));

  await expect.element(page.getByText("Enter a valid email address.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Email")).toHaveValue("not-an-email");
});
