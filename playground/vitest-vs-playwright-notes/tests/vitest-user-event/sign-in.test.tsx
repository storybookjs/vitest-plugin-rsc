import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { ada, createUser, sessionCount } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("renders the form", async () => {
  await renderServer({ url: "/sign-in" });

  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveValue("");
  await expect.element(page.getByLabelText("Password")).toHaveValue("");
});

test("signs in and opens the notes", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("signs in with the email in another case", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), "ADA@EXAMPLE.COM");
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("stores a session", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
  expect(await sessionCount()).toBe(1);
});

test("rejects a wrong password", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), "wrong password");
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
});

test("rejects an email without an account", async () => {
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), "nobody@example.com");
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
});

test("keeps the email after a failed sign-in", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), "wrong password");
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Email")).toHaveValue(ada.email);
});

test("stores no session after a failed sign-in", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), ada.email);
  await fill(page.getByLabelText("Password"), "wrong password");
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Invalid email or password.")).toBeInTheDocument();
  expect(await sessionCount()).toBe(0);
});

test("links to sign up", async () => {
  await renderServer({ url: "/sign-in" });

  await click(page.getByRole("navigation").getByRole("link", { name: "Sign up" }));

  await expect
    .element(page.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
});

test("sends a signed-in user to the notes", async () => {
  await signedIn();
  await renderServer({ url: "/sign-in" });

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
});
