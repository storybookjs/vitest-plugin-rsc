import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "#test/render.tsx";
import SignInPage from "./page.tsx";

test("renders sign-in form with email, passkey, and link to sign up", async () => {
  await renderServer(<SignInPage searchParams={Promise.resolve({})} />, { url: "/auth/sign-in" });

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
  await renderServer(<SignInPage searchParams={Promise.resolve({ sent: "magic-link" })} />, {
    url: "/auth/sign-in?sent=magic-link",
  });

  await expect
    .element(page.getByText("Check your inbox for the sign-in link."))
    .toBeInTheDocument();
});

test("shows the magic link error banner", async () => {
  await renderServer(<SignInPage searchParams={Promise.resolve({ error: "magic" })} />, {
    url: "/auth/sign-in?error=magic",
  });

  await expect
    .element(page.getByText("We couldn’t send your sign-in link. Please try again."))
    .toBeInTheDocument();
});

test("renders an inline error when the email is invalid", async () => {
  await renderServer(<SignInPage searchParams={Promise.resolve({})} />, { url: "/auth/sign-in" });

  await page.getByLabelText("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Continue with email" }).click();

  await expect.element(page.getByText("Enter a valid email address.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Email")).toHaveValue("not-an-email");
});
