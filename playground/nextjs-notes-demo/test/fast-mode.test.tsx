import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { signedInAs } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// What fast mode (`fast` of `vitestPluginNext()`) keeps of what a test sees,
// where the pages of a test file render in one app: the project
// nextjs-notes-demo-fast runs the suite in it. These hold with page loads
// too, as nextjs-notes-demo-browser runs them. In order: each test leans on
// the page of the one before.

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
