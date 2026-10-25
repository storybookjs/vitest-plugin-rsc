import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { ada, createUser, sessionCount } from "#test/db.ts";
import { signedIn } from "#test/dom-locators.ts";

test("renders the form", async () => {
  await renderServer({ url: "/sign-in" });

  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveValue("");
  await expect.element(page.getByLabelText("Password")).toHaveValue("");
});

test("signs in and opens the notes", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("signs in with the email in another case", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill("ADA@EXAMPLE.COM");
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("stores a session", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
  expect(await sessionCount()).toBe(1);
});

test("rejects a wrong password", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill("wrong password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
});

test("rejects an email without an account", async () => {
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill("nobody@example.com");
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
});

test("keeps the email after a failed sign-in", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill("wrong password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveValue(ada.email);
});

test("stores no session after a failed sign-in", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill("wrong password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
  expect(await sessionCount()).toBe(0);
});

test("links to sign up", async () => {
  await renderServer({ url: "/sign-in" });

  await page.getByRole("navigation").getByRole("link", { name: "Sign up" }).click();

  await expect
    .element(page.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
});

test("sends a signed-in user to the notes", async () => {
  await signedIn();
  await renderServer({ url: "/sign-in" });

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
});
