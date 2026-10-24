import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, screen } from "#test/fast-dom.ts";
import { createUser, grace, seedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

test("shows the title and the content", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk, bread" }]);
  await renderServer({ url: "/notes/1" });

  await expect.element(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(screen.getByText("Oat milk, bread")).toBeInTheDocument();
});

test("shows a placeholder without content", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Ideas" }]);
  await renderServer({ url: "/notes/1" });

  await expect.element(screen.getByText("No content yet.")).toBeInTheDocument();
});

test("shows a 404 for a note that does not exist", async () => {
  await signedIn();
  await renderServer({ url: "/notes/42" });

  await expect.element(screen.getByText("This page could not be found.")).toBeInTheDocument();
});

test("shows a 404 for an id that is not a number", async () => {
  await signedIn();
  await renderServer({ url: "/notes/groceries" });

  await expect.element(screen.getByText("This page could not be found.")).toBeInTheDocument();
});

test("shows a 404 for the note of another user", async () => {
  await signedIn();
  const other = await createUser(grace);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await renderServer({ url: "/notes/1" });

  await expect.element(screen.getByText("This page could not be found.")).toBeInTheDocument();
});

test("offers to favorite a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await expect
    .element(screen.getByRole("button", { name: "Favorite" }))
    .toHaveAttribute("aria-pressed", "false");
});

test("offers to unfavorite a favorite", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: "/notes/1" });

  await expect
    .element(screen.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("opens the edit form", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("link", { name: "Edit" }));

  await expect.element(screen.getByRole("heading", { name: "Edit note" })).toBeInTheDocument();
});

test("goes back to all notes", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("link", { name: "All notes" }));

  await expectTitles(["Ideas", "Groceries"]);
});

test("shows no banner on a later visit", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await expect.element(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(screen.getByText("Note created.")).not.toBeInTheDocument();
});
