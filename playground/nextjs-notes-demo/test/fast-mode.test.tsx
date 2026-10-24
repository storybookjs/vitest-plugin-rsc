import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { signedInAs } from "#test/auth.ts";
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// What fast mode (`mode: "fast"` of `vitestPluginNext()`) keeps of what a test
// sees, where the pages of a test file render in one app: the project
// nextjs-notes-demo-fast runs the suite in it. These hold with page loads too,
// in fidelity mode, as nextjs-notes-demo-browser runs them. In order: each test
// leans on the page of the one before.

test("types a title into the form", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Draft");

  await expect.element(page.getByLabelText("Title")).toHaveValue("Draft");
});

test("starts from an empty form, after the test before typed into it", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await expect.element(page.getByLabelText("Title")).toHaveValue("");
});

test("hydrates the HTML of the server with `ssr: true`", async () => {
  await signedInAs();
  const { errors } = await renderServer({ url: "/notes/new", ssr: true });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Groceries" }))
    .toBeInTheDocument();
  expect(errors).toEqual([]);
});

test("renders the page without HTML of the server after a test with it", async () => {
  await signedInAs();
  const { errors } = await renderServer({ url: "/notes/new", ssr: false });

  await page.getByLabelText("Title").fill("Errands");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Errands" }))
    .toBeInTheDocument();
  expect(errors).toEqual([]);
});

test("loads the page that the app navigates to without its router, after a page without HTML", async () => {
  await signedInAs();
  const { errors } = await renderServer({ url: "/notes" });

  // As a `<form>` without a Server Action or an `<a>` without Next's router would.
  window.location.assign("/profile");

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Profile" }))
    .toBeInTheDocument();
  expect(window.location.pathname).toBe("/profile");
  expect(errors).toEqual([]);
});

test("opens the page that the request of a page redirects to, from its HTML", async () => {
  // Signed out: the page sends the browser to sign in.
  const { errors } = await renderServer({ url: "/notes/new" });

  await expect.element(page.getByLabelText("Email")).toBeInTheDocument();
  expect(window.location.pathname).toBe("/auth/sign-in");
  expect(errors).toEqual([]);
});

test("answers a request of the test with the HTML of its page, while a page without it is open", async () => {
  await signedInAs();
  await renderServer({ url: "/notes" });

  const html = await (await handleRequest("/profile")).text();

  expect(html).toContain(">Profile</h1>");
  expect(html).not.toContain("__next_error__");
});
