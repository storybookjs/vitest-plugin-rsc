import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, screen } from "#test/fast-dom.ts";
import { seedNotes, storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

test("favorites a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Favorite" }));

  await expect
    .element(screen.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("stores the favorite", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Favorite" }));

  await expect.element(screen.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  expect((await storedNotes())[0]?.favorite).toBe(true);
});

test("unfavorites a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Unfavorite" }));

  await expect
    .element(screen.getByRole("button", { name: "Favorite" }))
    .toHaveAttribute("aria-pressed", "false");
});

test("moves a favorite to the top of the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Favorite" }));
  await expect.element(screen.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expectTitles(["Groceries", "Ideas"]);
});

test("marks the favorite in the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Favorite" }));
  await expect.element(screen.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expect.element(screen.getByText("★ Favorite")).toBeInTheDocument();
});

test("toggles back after two clicks", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Favorite" }));
  await click(screen.getByRole("button", { name: "Unfavorite" }));

  await expect.element(screen.getByRole("button", { name: "Favorite" })).toBeInTheDocument();
  await expect.poll(async () => (await storedNotes())[0]?.favorite).toBe(false);
});

test("leaves the other notes as they are", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes/2" });

  await click(screen.getByRole("button", { name: "Favorite" }));

  await expect.element(screen.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  expect((await storedNotes()).map((note) => note.favorite)).toEqual([false, true]);
});

test("keeps the content when favoriting", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Favorite" }));

  await expect.element(screen.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await expect.element(screen.getByText("Oat milk")).toBeInTheDocument();
});

test("keeps the favorite on the next visit", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await click(screen.getByRole("button", { name: "Favorite" }));
  await expect.element(screen.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await renderServer({ url: "/notes/1" });

  await expect
    .element(screen.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("lists the newest favorite first", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [
    { title: "Groceries", favorite: true },
    { title: "Ideas" },
    { title: "Reading list", favorite: true },
  ]);
  await renderServer({ url: "/notes" });

  await expectTitles(["Reading list", "Groceries", "Ideas"]);
});
