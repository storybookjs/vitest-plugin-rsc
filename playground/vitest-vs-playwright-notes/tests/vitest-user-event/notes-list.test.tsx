import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, screen } from "#test/fast-dom.ts";
import { createUser, grace, seedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

test("shows an empty state", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await expect.element(screen.getByText("No notes yet")).toBeInTheDocument();
  await expect.element(screen.getByText("0 notes")).toBeInTheDocument();
});

test("counts one note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes" });

  await expect.element(screen.getByText("1 note")).toBeInTheDocument();
});

test("counts the notes", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Reading list" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes" });

  await expect.element(screen.getByText("3 notes")).toBeInTheDocument();
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

  await expect.element(screen.getByText("★ Favorite")).toBeInTheDocument();
});

test("opens a note from the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk, bread" }]);
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("link", { name: "Groceries" }));

  await expect.element(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  await expect.element(screen.getByText("Oat milk, bread")).toBeInTheDocument();
});

test("opens the form of a new note", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("link", { name: "New note" }));

  await expect.element(screen.getByRole("heading", { name: "New note" })).toBeInTheDocument();
});

test("lists only the notes of the user", async () => {
  const user = await signedIn();
  const other = await createUser(grace);
  await seedNotes(user.id, [{ title: "Mine" }]);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await renderServer({ url: "/notes" });

  await expectTitles(["Mine"]);
  await expect.element(screen.getByText("1 note")).toBeInTheDocument();
});

test("opens the profile from the header", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("link", { name: "Profile" }));

  await expect.element(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
});
