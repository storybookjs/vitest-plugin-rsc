import { expect, test } from "./test.ts";
import { ada, createUser, sessionCount } from "#test/db.ts";

test("renders the form", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("");
  await expect(page.getByLabel("Password")).toHaveValue("");
});

test("signs in and opens the notes", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByText("Signed in as Ada Lovelace")).toBeVisible();
});

test("signs in with the email in another case", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill("ADA@EXAMPLE.COM");
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as Ada Lovelace")).toBeVisible();
});

test("stores a session", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as Ada Lovelace")).toBeVisible();
  expect(await sessionCount()).toBe(1);
});

test("rejects a wrong password", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("rejects an email without an account", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("keeps the email after a failed sign-in", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(ada.email);
});

test("stores no session after a failed sign-in", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  expect(await sessionCount()).toBe(0);
});

test("links to sign up", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByRole("navigation").getByRole("link", { name: "Sign up" }).click();

  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
});

test("sends a signed-in user to the notes", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
});
