import { expect } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { createUser, seedNotes, storedNotes } from "#test/db.ts";
import { signedIn, test } from "#test/vitest.ts";

test("requires a title", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
});

test("rejects a title of more than 100 characters", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("x".repeat(101));
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Title is at most 100 characters.")).toBeInTheDocument();
});

test("rejects content of more than 2000 characters", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Content").fill("x".repeat(2001));
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});

test("keeps the edits after an error", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("");
  await page.getByLabelText("Content").fill("Changed");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Content")).toHaveValue("Changed");
});

test("stores nothing after an error", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("");
  await page.getByLabelText("Content").fill("Changed");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  expect(await storedNotes(user.id)).toEqual([
    { title: "Groceries", content: "Oat milk", favorite: false },
  ]);
});

test("marks the title invalid", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
});

test("saves once the error is fixed", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Title").fill("");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await page.getByLabelText("Title").fill("Shopping");
  await page.getByRole("button", { name: "Save note" }).click();

  await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
});

test("shows a 404 for the note of another user", async ({ people }) => {
  await signedIn();
  const other = await createUser(people.grace);
  const [note] = await seedNotes(other.id, [{ title: "Grace's" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("shows a 404 for a note that does not exist", async () => {
  await signedIn();
  await renderServer({ url: "/notes/0/edit" });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("counts the characters as one types", async () => {
  const user = await signedIn();
  const [note] = await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: `/notes/${note!.id}/edit` });

  await page.getByLabelText("Content").fill("abc");

  await expect.element(page.getByText("3 / 2000")).toBeInTheDocument();
});
