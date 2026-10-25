import { expect } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { createUser, storedUser } from "#test/db.ts";
import { test } from "#test/vitest.ts";

test("renders the form", async () => {
  await renderServer({ url: "/sign-up" });

  await expect
    .element(page.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Name")).toHaveValue("");
  await expect.element(page.getByLabelText("Email")).toHaveValue("");
  await expect.element(page.getByLabelText("Password")).toHaveValue("");
});

test("creates an account and signs in", async ({ people }) => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), people.ada.name);
  await fill(page.getByLabelText("Email"), people.ada.email);
  await fill(page.getByLabelText("Password"), people.ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("stores the password as a hash", async ({ people }) => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), people.ada.name);
  await fill(page.getByLabelText("Email"), people.ada.email);
  await fill(page.getByLabelText("Password"), people.ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  const user = await storedUser(people.ada.email);
  expect(user?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
});

test("stores the email in lower case", async ({ people }) => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), people.ada.name);
  await fill(page.getByLabelText("Email"), people.ada.email.toUpperCase());
  await fill(page.getByLabelText("Password"), people.ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  expect(await storedUser(people.ada.email)).toBeDefined();
});

for (const [label, value, error] of [
  ["Name", "", "Name is required."],
  ["Email", "ada", "Enter a valid email address."],
  ["Password", "short", "Password must be at least 8 characters."],
] as const) {
  test(`rejects an invalid ${label.toLowerCase()}`, async ({ people }) => {
    await renderServer({ url: "/sign-up" });

    await fill(page.getByLabelText("Name"), people.ada.name);
    await fill(page.getByLabelText("Email"), people.ada.email);
    await fill(page.getByLabelText("Password"), people.ada.password);
    await fill(page.getByLabelText(label), value);
    await click(page.getByRole("button", { name: "Create account" }));

    await expect.element(page.getByText(error)).toBeInTheDocument();
    expect(await storedUser(people.ada.email)).toBeUndefined();
  });
}

test("rejects an email that has an account", async ({ people }) => {
  await createUser(people.ada);
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), "Another Ada");
  await fill(page.getByLabelText("Email"), people.ada.email);
  await fill(page.getByLabelText("Password"), "another password");
  await click(page.getByRole("button", { name: "Create account" }));

  await expect
    .element(page.getByText("An account with this email already exists."))
    .toBeInTheDocument();
});

test("keeps the name and the email after an error", async ({ people }) => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), people.ada.name);
  await fill(page.getByLabelText("Email"), people.ada.email);
  await fill(page.getByLabelText("Password"), "short");
  await click(page.getByRole("button", { name: "Create account" }));

  await expect
    .element(page.getByText("Password must be at least 8 characters."))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Name")).toHaveValue(people.ada.name);
  await expect.element(page.getByLabelText("Email")).toHaveValue(people.ada.email);
});

test("marks the invalid field", async ({ people }) => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), people.ada.name);
  await fill(page.getByLabelText("Email"), "not an email");
  await fill(page.getByLabelText("Password"), people.ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
});
