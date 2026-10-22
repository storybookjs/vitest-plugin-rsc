import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { ada, createUser, storedUser } from "#test/db.ts";

test("renders the form", async () => {
  await renderServer({ url: "/sign-up" });

  await expect
    .element(page.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Name")).toHaveValue("");
  await expect.element(page.getByLabelText("Email")).toHaveValue("");
  await expect.element(page.getByLabelText("Password")).toHaveValue("");
});

test("creates an account and signs in", async () => {
  await renderServer({ url: "/sign-up" });

  await page.getByLabelText("Name").fill(ada.name);
  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("stores the password as a hash", async () => {
  await renderServer({ url: "/sign-up" });

  await page.getByLabelText("Name").fill(ada.name);
  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  const user = await storedUser(ada.email);
  expect(user?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
});

test("stores the email in lower case", async () => {
  await renderServer({ url: "/sign-up" });

  await page.getByLabelText("Name").fill(ada.name);
  await page.getByLabelText("Email").fill("Ada@Example.COM");
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  expect(await storedUser("ada@example.com")).toBeDefined();
});

for (const [label, value, error] of [
  ["Name", "", "Name is required."],
  ["Email", "ada", "Enter a valid email address."],
  ["Password", "short", "Password must be at least 8 characters."],
] as const) {
  test(`rejects an invalid ${label.toLowerCase()}`, async () => {
    await renderServer({ url: "/sign-up" });

    await page.getByLabelText("Name").fill(ada.name);
    await page.getByLabelText("Email").fill(ada.email);
    await page.getByLabelText("Password").fill(ada.password);
    await page.getByLabelText(label).fill(value);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect.element(page.getByText(error)).toBeInTheDocument();
    expect(await storedUser(ada.email)).toBeUndefined();
  });
}

test("rejects an email that has an account", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-up" });

  await page.getByLabelText("Name").fill("Another Ada");
  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill("another password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect
    .element(page.getByText("An account with this email already exists."))
    .toBeInTheDocument();
});

test("keeps the name and the email after an error", async () => {
  await renderServer({ url: "/sign-up" });

  await page.getByLabelText("Name").fill(ada.name);
  await page.getByLabelText("Email").fill(ada.email);
  await page.getByLabelText("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect
    .element(page.getByText("Password must be at least 8 characters."))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Name")).toHaveValue(ada.name);
  await expect.element(page.getByLabelText("Email")).toHaveValue(ada.email);
});

test("marks the invalid field", async () => {
  await renderServer({ url: "/sign-up" });

  await page.getByLabelText("Name").fill(ada.name);
  await page.getByLabelText("Email").fill("not an email");
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
});
