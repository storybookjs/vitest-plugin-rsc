import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { watchSentLinks } from "#test/email.ts";

test("renders the email-only sign-up form", async () => {
  await renderServer({ url: "/auth/sign-up" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome to Notes Demo" }))
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
  await renderServer({ url: "/auth/sign-up" });

  await page.getByLabelText("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.element(page.getByText("Enter a valid email address.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Email")).toHaveValue("not-an-email");
});

test("shows each flashed error once, not on a later visit", async () => {
  await renderServer({ url: "/auth/sign-up" });

  await page.getByRole("button", { name: "Create account" }).click();
  await expect.element(page.getByRole("main").getByRole("alert")).toBeInTheDocument();
  // A second flash, while the page still shows the first.
  await page.getByLabelText("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect.element(page.getByText("Enter a valid email address.")).toBeInTheDocument();

  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("main").getByRole("link", { name: "Sign up" }).click();

  await expect.element(page.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  await expect.element(page.getByRole("main").getByRole("alert")).not.toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveValue("");
});

test("shows the magic link sent confirmation banner", async () => {
  await renderServer({ url: "/auth/sign-up?sent=magic-link" });

  await expect
    .element(page.getByText("Check your inbox for the link to finish creating your account."))
    .toBeInTheDocument();
});

test("a new user follows the magic link to set up a passkey", async () => {
  const sentLinks = watchSentLinks();
  await renderServer({ url: "/auth/sign-up" });

  await page.getByLabelText("Email").fill("ada@example.com");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect
    .element(page.getByText("Check your inbox for the link to finish creating your account."))
    .toBeInTheDocument();

  expect(sentLinks()).toHaveLength(1);
  const [link] = sentLinks();
  await renderServer({ url: `${link!.pathname}${link!.search}` });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Add a passkey" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Finish setting up passwordless sign-in for ada@example.com."))
    .toBeInTheDocument();
});
