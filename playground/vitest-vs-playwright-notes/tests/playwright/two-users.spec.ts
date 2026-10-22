import { expect, test } from "./test.ts";
import {
  ada,
  createSession,
  createUser,
  grace,
  seedNotes,
  sessionCount,
  storedNotes,
} from "#test/db.ts";

test("shows each user their own notes", async ({ page, signedIn, expectTitles }) => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Ada's" }]);
  const user = await signedIn(grace);
  await seedNotes(user.id, [{ title: "Grace's" }]);
  await page.goto("/notes");

  await expectTitles(["Grace's"]);
  await expect(page.getByText("Signed in as Grace Hopper")).toBeVisible();
});

test("counts only the notes of the user", async ({ page, signedIn }) => {
  const user = await signedIn();
  const other = await createUser(grace);
  await seedNotes(other.id, [{ title: "One" }, { title: "Two" }]);
  await seedNotes(user.id, [{ title: "Mine" }]);
  await page.goto("/notes");

  await expect(page.getByText("1 note", { exact: true })).toBeVisible();
});

test("does not open the note of another user", async ({ page, signedIn }) => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Ada's" }]);
  await signedIn(grace);
  await page.goto("/notes/1");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("does not edit the note of another user", async ({ page, signedIn }) => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Ada's" }]);
  await signedIn(grace);
  await page.goto("/notes/1/edit");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("does not find the notes of another user", async ({ page, signedIn }) => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Secret plan" }]);
  await signedIn(grace);
  await page.goto("/notes?q=secret");

  await expect(page.getByText("No notes match “secret”.")).toBeVisible();
});

test("signs in the second user with the form", async ({ page }) => {
  await createUser(ada);
  await createUser(grace);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(grace.email);
  await page.getByLabel("Password").fill(grace.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as Grace Hopper")).toBeVisible();
});

test("signs up a second user", async ({ page }) => {
  await createUser(ada);
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(grace.name);
  await page.getByLabel("Email").fill(grace.email);
  await page.getByLabel("Password").fill(grace.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome, Grace Hopper!")).toBeVisible();
});

test("ends only the session that signs out", async ({ page, signedIn }) => {
  const user = await signedIn();
  await createSession(user.id);
  await page.goto("/notes");

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByText("You are signed out.")).toBeVisible();
  expect(await sessionCount()).toBe(1);
});

test("favorites only the note of the user", async ({ page, signedIn }) => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Groceries" }]);
  const user = await signedIn(grace);
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/2");

  await page.getByRole("button", { name: "Favorite", exact: true }).click();

  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
  expect((await storedNotes()).map((note) => note.favorite)).toEqual([false, true]);
});

test("deletes only the note of the user", async ({ page, signedIn }) => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Groceries" }]);
  const user = await signedIn(grace);
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/notes/2");

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Note deleted.")).toBeVisible();
  expect(await storedNotes()).toEqual([{ title: "Groceries", content: "", favorite: false }]);
});
