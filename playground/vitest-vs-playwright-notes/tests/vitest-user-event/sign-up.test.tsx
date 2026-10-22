import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
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

  await fill(page.getByLabelText("Name"), ada.name);
  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("stores the password as a hash", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), ada.name);
  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  const user = await storedUser(ada.email);
  expect(user?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
});

test("stores the email in lower case", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), ada.name);
  await fill(page.getByLabelText("Email"), "Ada@Example.COM");
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

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

    await fill(page.getByLabelText("Name"), ada.name);
    await fill(page.getByLabelText("Email"), ada.email);
    await fill(page.getByLabelText("Password"), ada.password);
    await fill(page.getByLabelText(label), value);
    await click(page.getByRole("button", { name: "Create account" }));

    await expect.element(page.getByText(error)).toBeInTheDocument();
    expect(await storedUser(ada.email)).toBeUndefined();
  });
}

test("rejects an email that has an account", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), "Another Ada");
  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), "another password");
  await click(page.getByRole("button", { name: "Create account" }));

  await expect
    .element(page.getByText("An account with this email already exists."))
    .toBeInTheDocument();
});

test("keeps the name and the email after an error", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), ada.name);
  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), "short");
  await click(page.getByRole("button", { name: "Create account" }));

  await expect
    .element(page.getByText("Password must be at least 8 characters."))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Name")).toHaveValue(ada.name);
  await expect.element(page.getByLabelText("Email")).toHaveValue(ada.email);
});

test("marks the invalid field", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), ada.name);
  await fill(page.getByLabelText("Email"), "not an email");
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
});
