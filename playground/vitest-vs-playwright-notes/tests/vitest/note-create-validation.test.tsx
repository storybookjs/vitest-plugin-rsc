import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("requires a title", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
});

test("requires a title that is not only spaces", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("     ");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
});

test("rejects a title of more than 100 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("x".repeat(101));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is at most 100 characters.")).toBeInTheDocument();
});

test("accepts a title of 100 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("x".repeat(100));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
});

test("rejects content of more than 2000 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Long");
  await page.getByLabelText("Content").fill("x".repeat(2001));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});

test("keeps the title and the content after an error", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("x".repeat(101));
  await page.getByLabelText("Content").fill("Keep this");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is at most 100 characters.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("x".repeat(101));
  await expect.element(page.getByLabelText("Content")).toHaveValue("Keep this");
});

test("marks the title invalid", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
});

test("stores nothing after an error", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("No title");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([]);
});

test("creates the note once the error is fixed", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
});

test("shows every error at once", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("x".repeat(2001));
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});
