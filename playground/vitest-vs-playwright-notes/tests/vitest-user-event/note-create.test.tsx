import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

test("renders the form", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await expect.element(screen.getByRole("heading", { name: "New note" })).toBeInTheDocument();
  await expect.element(screen.getByLabelText("Title")).toHaveValue("");
  await expect.element(screen.getByLabelText("Content")).toHaveValue("");
  await expect.element(screen.getByText("0 / 2000")).toBeInTheDocument();
});

test("creates a note and opens it", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Groceries");
  await fill(screen.getByLabelText("Content"), "Oat milk, bread");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
  await expect.element(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(screen.getByText("Oat milk, bread")).toBeInTheDocument();
});

test("stores the note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Groceries");
  await fill(screen.getByLabelText("Content"), "Oat milk, bread");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([
    { title: "Groceries", content: "Oat milk, bread", favorite: false },
  ]);
});

test("trims the title", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "   Groceries   ");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  expect((await storedNotes())[0]?.title).toBe("Groceries");
});

test("creates a note without content", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Ideas");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("No content yet.")).toBeInTheDocument();
});

test("counts the characters of the content", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Content"), "Hello");

  await expect.element(screen.getByText("5 / 2000")).toBeInTheDocument();
});

test("lists the new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Groceries");
  await click(screen.getByRole("button", { name: "Create note" }));
  await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expectTitles(["Groceries"]);
});

test("cancels back to the list", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(screen.getByRole("main").getByRole("link", { name: "Cancel" }));

  await expect.element(screen.getByText("No notes yet")).toBeInTheDocument();
});

test("counts the new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Groceries");
  await click(screen.getByRole("button", { name: "Create note" }));
  await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expect.element(screen.getByText("1 note")).toBeInTheDocument();
});

test("creates a note that is not a favorite", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Groceries");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect
    .element(screen.getByRole("button", { name: "Favorite" }))
    .toHaveAttribute("aria-pressed", "false");
});
