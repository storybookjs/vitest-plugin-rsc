import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "#test/render.tsx";
import SignUpPage from "./page.tsx";

test("renders the email-only sign-up form", async () => {
  await renderServer(<SignUpPage searchParams={Promise.resolve({})} />, { url: "/auth/sign-up" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Create account" })).toBeInTheDocument();

  // No passkey button on sign-up — that affordance is sign-in only.
  expect(page.getByRole("button", { name: "Sign in with a passkey" }).query()).toBeNull();
  // No "Or" divider — sign-up is single-method.
  expect(page.getByText("Or", { exact: true }).query()).toBeNull();

  await expect
    .element(page.getByRole("main").getByRole("link", { name: "Sign in" }))
    .toHaveAttribute("href", "/auth/sign-in");
});

test("renders an inline error when the email is invalid", async () => {
  await renderServer(<SignUpPage searchParams={Promise.resolve({})} />, { url: "/auth/sign-up" });

  await page.getByLabelText("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.element(page.getByText("Enter a valid email address.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Email")).toHaveValue("not-an-email");
});

test("shows the magic link sent confirmation banner", async () => {
  await renderServer(<SignUpPage searchParams={Promise.resolve({ sent: "magic-link" })} />, {
    url: "/auth/sign-up?sent=magic-link",
  });

  await expect
    .element(page.getByText("Check your inbox for the link to finish creating your account."))
    .toBeInTheDocument();
});
