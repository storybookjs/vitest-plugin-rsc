import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

test("renders the form", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await expect.element(page.getByRole("heading", { name: "New note" })).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("");
  await expect.element(page.getByLabelText("Content")).toHaveValue("");
  await expect.element(page.getByText("0 / 2000")).toBeInTheDocument();
});

test("creates a note and opens it", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByLabelText("Content").fill("Oat milk, bread");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(page.getByText("Oat milk, bread")).toBeInTheDocument();
});

test("stores the note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByLabelText("Content").fill("Oat milk, bread");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([
    { title: "Groceries", content: "Oat milk, bread", favorite: false },
  ]);
});

test("trims the title", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("   Groceries   ");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  expect((await storedNotes())[0]?.title).toBe("Groceries");
});

test("creates a note without content", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Ideas");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("No content yet.")).toBeInTheDocument();
});

test("counts the characters of the content", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("Hello");

  await expect.element(page.getByText("5 / 2000")).toBeInTheDocument();
});

test("lists the new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Groceries"]);
});

test("cancels back to the list", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByRole("main").getByRole("link", { name: "Cancel" }).click();

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("counts the new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expect.element(page.getByText("1 note", { exact: true })).toBeInTheDocument();
});

test("creates a note that is not a favorite", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect
    .element(page.getByRole("button", { name: "Favorite", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
});
