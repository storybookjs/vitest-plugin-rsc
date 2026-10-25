import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click } from "#test/user-event.ts";
import { seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

test("favorites a note", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));

  await expect
    .element(page.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("stores the favorite", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));

  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  expect((await storedNotes(user.id))[0]?.favorite).toBe(true);
});

test("unfavorites a note", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Unfavorite" }));

  await expect
    .element(page.getByRole("button", { name: "Favorite", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
});

test("moves a favorite to the top of the list", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await click(page.getByRole("link", { name: "All notes" }));

  await expectTitles(["Groceries", "Ideas"]);
});

test("marks the favorite in the list", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await click(page.getByRole("link", { name: "All notes" }));

  await expect.element(page.getByText("★ Favorite")).toBeInTheDocument();
});

test("toggles back after two clicks", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));
  await click(page.getByRole("button", { name: "Unfavorite" }));

  await expect
    .element(page.getByRole("button", { name: "Favorite", exact: true }))
    .toBeInTheDocument();
  await expect.poll(async () => (await storedNotes(user.id))[0]?.favorite).toBe(false);
});

test("leaves the other notes as they are", async () => {
  const user = await signedIn();
  const [, note] = await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));

  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  expect((await storedNotes(user.id)).map((note) => note.favorite)).toEqual([false, true]);
});

test("keeps the content when favoriting", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));

  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await expect.element(page.getByText("Oat milk")).toBeInTheDocument();
});

test("keeps the favorite on the next visit", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await renderServer({ url: `/notes/${note!.id}` });

  await expect
    .element(page.getByRole("button", { name: "Unfavorite" }))
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
