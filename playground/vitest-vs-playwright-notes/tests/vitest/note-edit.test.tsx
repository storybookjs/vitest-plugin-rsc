import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

test("fills the form in from the note", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await expect.element(page.getByRole("heading", { name: "Edit note" })).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("Groceries");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Oat milk");
});

test("counts the characters of the content there is", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await expect.element(page.getByText("8 / 2000")).toBeInTheDocument();
});

test("saves the note and opens it", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Shopping" })).toBeInTheDocument();
});

test("stores the changes", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("Shopping");
  await page.getByLabelText("Content").fill("Bread");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
  expect(await storedNotes(user.id)).toEqual([
    { title: "Shopping", content: "Bread", favorite: false },
  ]);
});

test("trims the title", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("  Shopping  ");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByRole("heading", { name: "Shopping" })).toBeInTheDocument();
  expect((await storedNotes(user.id))[0]?.title).toBe("Shopping");
});

test("empties the content", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Content").fill("");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("No content yet.")).toBeInTheDocument();
});

test("cancels without saving", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("Shopping");
  await page.getByRole("main").getByRole("link", { name: "Cancel" }).click();

  await expect.element(page.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  expect((await storedNotes(user.id))[0]?.title).toBe("Groceries");
});

test("edits a note from its page", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}` });

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabelText("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByRole("heading", { name: "Shopping" })).toBeInTheDocument();
});

test("lists the new title", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }, { title: "Ideas" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Ideas", "Shopping"]);
});

test("keeps the favorite", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", favorite: true }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect
    .element(page.getByRole("button", { name: "Unfavorite" }))
    .toHaveAttribute("aria-pressed", "true");
});
