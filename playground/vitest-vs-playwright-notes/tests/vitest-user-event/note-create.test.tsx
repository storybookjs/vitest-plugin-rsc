import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
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

  await fill(page.getByLabelText("Title"), "Groceries");
  await fill(page.getByLabelText("Content"), "Oat milk, bread");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(page.getByText("Oat milk, bread")).toBeInTheDocument();
});

test("stores the note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Groceries");
  await fill(page.getByLabelText("Content"), "Oat milk, bread");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([
    { title: "Groceries", content: "Oat milk, bread", favorite: false },
  ]);
});

test("trims the title", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "   Groceries   ");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  expect((await storedNotes())[0]?.title).toBe("Groceries");
});

test("creates a note without content", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Ideas");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("No content yet.")).toBeInTheDocument();
});

test("counts the characters of the content", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Content"), "Hello");

  await expect.element(page.getByText("5 / 2000")).toBeInTheDocument();
});

test("lists the new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Groceries");
  await click(page.getByRole("button", { name: "Create note" }));
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await click(page.getByRole("link", { name: "All notes" }));

  await expectTitles(["Groceries"]);
});

test("cancels back to the list", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(page.getByRole("main").getByRole("link", { name: "Cancel" }));

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("counts the new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Groceries");
  await click(page.getByRole("button", { name: "Create note" }));
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await click(page.getByRole("link", { name: "All notes" }));

  await expect.element(page.getByText("1 note", { exact: true })).toBeInTheDocument();
});

test("creates a note that is not a favorite", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Groceries");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect
    .element(page.getByRole("button", { name: "Favorite", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
});
