import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { seedNotes, storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

test("fills the form in from the note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await expect.element(screen.getByRole("heading", { name: "Edit note" })).toBeInTheDocument();
  await expect.element(screen.getByLabelText("Title")).toHaveValue("Groceries");
  await expect.element(screen.getByLabelText("Content")).toHaveValue("Oat milk");
});

test("counts the characters of the content there is", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await expect.element(screen.getByText("8 / 2000")).toBeInTheDocument();
});

test("saves the note and opens it", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "Shopping");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Note saved.")).toBeInTheDocument();
  await expect.element(screen.getByRole("heading", { name: "Shopping" })).toBeInTheDocument();
});

test("stores the changes", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "Shopping");
  await fill(screen.getByLabelText("Content"), "Bread");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Note saved.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([{ title: "Shopping", content: "Bread", favorite: false }]);
});

test("trims the title", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "  Shopping  ");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByRole("heading", { name: "Shopping" })).toBeInTheDocument();
  expect((await storedNotes())[0]?.title).toBe("Shopping");
});

test("empties the content", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Content"), "");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("No content yet.")).toBeInTheDocument();
});

test("cancels without saving", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "Shopping");
  await click(screen.getByRole("main").getByRole("link", { name: "Cancel" }));

  await expect.element(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  expect((await storedNotes())[0]?.title).toBe("Groceries");
});

test("edits a note from its page", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("link", { name: "Edit" }));
  await fill(screen.getByLabelText("Title"), "Shopping");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByRole("heading", { name: "Shopping" })).toBeInTheDocument();
});

test("lists the new title", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "Shopping");
  await click(screen.getByRole("button", { name: "Save note" }));
  await expect.element(screen.getByText("Note saved.")).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expectTitles(["Ideas", "Shopping"]);
});

test("keeps the favorite", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "Shopping");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect
    .element(screen.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});
