import { expect, test } from "./test.ts";
import { ada, createUser, storedUser } from "#test/db.ts";

test("renders the form", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByLabel("Email")).toHaveValue("");
  await expect(page.getByLabel("Password")).toHaveValue("");
});

test("creates an account and signs in", async ({ page }) => {
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(ada.name);
  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome, Ada Lovelace!")).toBeVisible();
  await expect(page.getByText("Signed in as Ada Lovelace")).toBeVisible();
});

test("stores the password as a hash", async ({ page }) => {
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(ada.name);
  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome, Ada Lovelace!")).toBeVisible();
  const user = await storedUser(ada.email);
  expect(user?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
});

test("stores the email in lower case", async ({ page }) => {
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(ada.name);
  await page.getByLabel("Email").fill("Ada@Example.COM");
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome, Ada Lovelace!")).toBeVisible();
  expect(await storedUser("ada@example.com")).toBeDefined();
});

for (const [label, value, error] of [
  ["Name", "", "Name is required."],
  ["Email", "ada", "Enter a valid email address."],
  ["Password", "short", "Password must be at least 8 characters."],
] as const) {
  test(`rejects an invalid ${label.toLowerCase()}`, async ({ page }) => {
    await page.goto("/sign-up");

    await page.getByLabel("Name").fill(ada.name);
    await page.getByLabel("Email").fill(ada.email);
    await page.getByLabel("Password").fill(ada.password);
    await page.getByLabel(label).fill(value);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(error)).toBeVisible();
    expect(await storedUser(ada.email)).toBeUndefined();
  });
}

test("rejects an email that has an account", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill("Another Ada");
  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill("another password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("An account with this email already exists.")).toBeVisible();
});

test("keeps the name and the email after an error", async ({ page }) => {
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(ada.name);
  await page.getByLabel("Email").fill(ada.email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(ada.name);
  await expect(page.getByLabel("Email")).toHaveValue(ada.email);
});

test("marks the invalid field", async ({ page }) => {
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(ada.name);
  await page.getByLabel("Email").fill("not an email");
  await page.getByLabel("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Name")).not.toHaveAttribute("aria-invalid");
});
