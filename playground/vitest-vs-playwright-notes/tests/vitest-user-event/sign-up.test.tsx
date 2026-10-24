import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { ada, createUser, storedUser } from "#test/db.ts";

test("renders the form", async () => {
  await renderServer({ url: "/sign-up" });

  await expect
    .element(screen.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
  await expect.element(screen.getByLabelText("Name")).toHaveValue("");
  await expect.element(screen.getByLabelText("Email")).toHaveValue("");
  await expect.element(screen.getByLabelText("Password")).toHaveValue("");
});

test("creates an account and signs in", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(screen.getByLabelText("Name"), ada.name);
  await fill(screen.getByLabelText("Email"), ada.email);
  await fill(screen.getByLabelText("Password"), ada.password);
  await click(screen.getByRole("button", { name: "Create account" }));

  await expect.element(screen.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  await expect.element(screen.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("stores the password as a hash", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(screen.getByLabelText("Name"), ada.name);
  await fill(screen.getByLabelText("Email"), ada.email);
  await fill(screen.getByLabelText("Password"), ada.password);
  await click(screen.getByRole("button", { name: "Create account" }));

  await expect.element(screen.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  const user = await storedUser(ada.email);
  expect(user?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
});

test("stores the email in lower case", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(screen.getByLabelText("Name"), ada.name);
  await fill(screen.getByLabelText("Email"), "Ada@Example.COM");
  await fill(screen.getByLabelText("Password"), ada.password);
  await click(screen.getByRole("button", { name: "Create account" }));

  await expect.element(screen.getByText("Welcome, Ada Lovelace!")).toBeInTheDocument();
  expect(await storedUser("ada@example.com")).toBeDefined();
});

for (const [label, value, error] of [
  ["Name", "", "Name is required."],
  ["Email", "ada", "Enter a valid email address."],
  ["Password", "short", "Password must be at least 8 characters."],
] as const) {
  test(`rejects an invalid ${label.toLowerCase()}`, async () => {
    await renderServer({ url: "/sign-up" });

    await fill(screen.getByLabelText("Name"), ada.name);
    await fill(screen.getByLabelText("Email"), ada.email);
    await fill(screen.getByLabelText("Password"), ada.password);
    await fill(screen.getByLabelText(label), value);
    await click(screen.getByRole("button", { name: "Create account" }));

    await expect.element(screen.getByText(error)).toBeInTheDocument();
    expect(await storedUser(ada.email)).toBeUndefined();
  });
}

test("rejects an email that has an account", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-up" });

  await fill(screen.getByLabelText("Name"), "Another Ada");
  await fill(screen.getByLabelText("Email"), ada.email);
  await fill(screen.getByLabelText("Password"), "another password");
  await click(screen.getByRole("button", { name: "Create account" }));

  await expect
    .element(screen.getByText("An account with this email already exists."))
    .toBeInTheDocument();
});

test("keeps the name and the email after an error", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(screen.getByLabelText("Name"), ada.name);
  await fill(screen.getByLabelText("Email"), ada.email);
  await fill(screen.getByLabelText("Password"), "short");
  await click(screen.getByRole("button", { name: "Create account" }));

  await expect
    .element(screen.getByText("Password must be at least 8 characters."))
    .toBeInTheDocument();
  await expect.element(screen.getByLabelText("Name")).toHaveValue(ada.name);
  await expect.element(screen.getByLabelText("Email")).toHaveValue(ada.email);
});

test("marks the invalid field", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(screen.getByLabelText("Name"), ada.name);
  await fill(screen.getByLabelText("Email"), "not an email");
  await fill(screen.getByLabelText("Password"), ada.password);
  await click(screen.getByRole("button", { name: "Create account" }));

  await expect.element(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  await expect.element(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
});
