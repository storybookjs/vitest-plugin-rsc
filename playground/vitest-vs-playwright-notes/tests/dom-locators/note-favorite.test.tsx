import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/dom-locators.ts";

test("favorites a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect
    .element(page.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("stores the favorite", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  expect((await storedNotes())[0]?.favorite).toBe(true);
});

test("unfavorites a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Unfavorite" }).click();

  await expect
    .element(page.getByRole("button", { name: "Favorite", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
});

test("moves a favorite to the top of the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Groceries", "Ideas"]);
});

test("marks the favorite in the list", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expect.element(page.getByText("★ Favorite")).toBeInTheDocument();
});

test("toggles back after two clicks", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await page.getByRole("button", { name: "Unfavorite" }).click();

  await expect
    .element(page.getByRole("button", { name: "Favorite", exact: true }))
    .toBeInTheDocument();
  await expect.poll(async () => (await storedNotes())[0]?.favorite).toBe(false);
});

test("leaves the other notes as they are", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: "/notes/2" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  expect((await storedNotes()).map((note) => note.favorite)).toEqual([false, true]);
});

test("keeps the content when favoriting", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await expect.element(page.getByText("Oat milk")).toBeInTheDocument();
});

test("keeps the favorite on the next visit", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await renderServer({ url: "/notes/1" });

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
