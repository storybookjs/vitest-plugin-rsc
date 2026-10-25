import { expect } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click } from "#test/user-event.ts";
import { createUser, seedNotes } from "#test/db.ts";
import { expectTitles, signedIn, test } from "#test/vitest.ts";

test("shows the title and the content", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk, bread" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(page.getByText("Oat milk, bread")).toBeInTheDocument();
});

test("shows a placeholder without content", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Ideas" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await expect.element(page.getByText("No content yet.")).toBeInTheDocument();
});

test("shows a 404 for a note that does not exist", async () => {
  await signedIn();
  await renderServer({ url: "/notes/0" });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("shows a 404 for an id that is not a number", async () => {
  await signedIn();
  await renderServer({ url: "/notes/groceries" });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("shows a 404 for the note of another user", async ({ people }) => {
  await signedIn();
  const other = await createUser(people.grace);
  const [note] = await seedNotes(other.id, [{ title: "Grace's" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("offers to favorite a note", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await expect
    .element(page.getByRole("button", { name: "Favorite", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
});

test("offers to unfavorite a favorite", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await expect
    .element(page.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("opens the edit form", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("link", { name: "Edit" }));

  await expect.element(page.getByRole("heading", { name: "Edit note" })).toBeInTheDocument();
});

test("goes back to all notes", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("link", { name: "All notes" }));

  await expectTitles(["Ideas", "Groceries"]);
});

test("shows no banner on a later visit", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(page.getByText("Note created.")).not.toBeInTheDocument();
});
