import { expect } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click } from "#test/user-event.ts";
import { createUser, seedNotes } from "#test/db.ts";
import { expectTitles, signedIn, test } from "#test/vitest.ts";

test("shows an empty state", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
  await expect.element(page.getByText("0 notes")).toBeInTheDocument();
});

test("counts one note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("1 note", { exact: true })).toBeInTheDocument();
});

test("counts the notes", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Reading list" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("3 notes")).toBeInTheDocument();
});

test("lists the newest note first", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Reading list" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes" });

  await expectTitles(["Ideas", "Reading list", "Groceries"]);
});

test("lists the favorites first", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [
    { title: "Groceries", favorite: true },
    { title: "Reading list" },
    { title: "Ideas" },
  ]);
  await renderServer({ url: "/notes" });

  await expectTitles(["Groceries", "Ideas", "Reading list"]);
});

test("marks the favorites", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }, { title: "Ideas" }]);
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("★ Favorite")).toBeInTheDocument();
});

test("opens a note from the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk, bread" }]);
  await renderServer({ url: "/notes" });

  await click(page.getByRole("link", { name: "Groceries" }));

  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(page.getByText("Oat milk, bread")).toBeInTheDocument();
});

test("opens the form of a new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(page.getByRole("link", { name: "New note" }));

  await expect.element(page.getByRole("heading", { name: "New note" })).toBeInTheDocument();
});

test("lists only the notes of the user", async ({ people }) => {
  const user = await signedIn();
  const other = await createUser(people.grace);
  await seedNotes(user.id, [{ title: "Mine" }]);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await renderServer({ url: "/notes" });

  await expectTitles(["Mine"]);
  await expect.element(page.getByText("1 note", { exact: true })).toBeInTheDocument();
});

test("opens the profile from the header", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(page.getByRole("link", { name: "Profile" }));

  await expect.element(page.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
});
