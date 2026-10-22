import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click } from "#test/user-event.ts";
import { createUser, grace, seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

test("deletes a note and goes back to the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
});

test("removes the note from the database", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([]);
});

test("removes the note from the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  await expectTitles(["Ideas"]);
});

test("counts one note less", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }, { title: "Reading list" }]);
  await renderServer({ url: "/notes/2" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("2 notes")).toBeInTheDocument();
});

test("keeps the other notes", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }, { title: "Reading list" }]);
  await renderServer({ url: "/notes/2" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  expect((await storedNotes()).map((note) => note.title)).toEqual(["Groceries", "Reading list"]);
});

test("shows the empty state after the last note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("shows a 404 for the deleted note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));
  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  await renderServer({ url: "/notes/1" });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("deletes a favorite", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  await expect.element(page.getByText("★ Favorite")).not.toBeInTheDocument();
});

test("keeps the notes of other users", async () => {
  const user = await signedIn();
  const other = await createUser(grace);
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  expect((await storedNotes()).map((note) => note.title)).toEqual(["Grace's"]);
});

test("shows no banner on a later visit of the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(page.getByRole("button", { name: "Delete" }));
  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
  await expect.element(page.getByText("Note deleted.")).not.toBeInTheDocument();
});
