import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import {
  ada,
  createSession,
  createUser,
  grace,
  seedNotes,
  sessionCount,
  storedNotes,
} from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

test("shows each user their own notes", async () => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Ada's" }]);
  const user = await signedIn(grace);
  await seedNotes(user.id, [{ title: "Grace's" }]);
  await renderServer({ url: "/notes" });

  await expectTitles(["Grace's"]);
  await expect.element(page.getByText("Signed in as Grace Hopper")).toBeInTheDocument();
});

test("counts only the notes of the user", async () => {
  const user = await signedIn();
  const other = await createUser(grace);
  await seedNotes(other.id, [{ title: "One" }, { title: "Two" }]);
  await seedNotes(user.id, [{ title: "Mine" }]);
  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("1 note", { exact: true })).toBeInTheDocument();
});

test("does not open the note of another user", async () => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Ada's" }]);
  await signedIn(grace);
  await renderServer({ url: "/notes/1" });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("does not edit the note of another user", async () => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Ada's" }]);
  await signedIn(grace);
  await renderServer({ url: "/notes/1/edit" });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("does not find the notes of another user", async () => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Secret plan" }]);
  await signedIn(grace);
  await renderServer({ url: "/notes?q=secret" });

  await expect.element(page.getByText("No notes match “secret”.")).toBeInTheDocument();
});

test("signs in the second user with the form", async () => {
  await createUser(ada);
  await createUser(grace);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), grace.email);
  await fill(page.getByLabelText("Password"), grace.password);
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Signed in as Grace Hopper")).toBeInTheDocument();
});

test("signs up a second user", async () => {
  await createUser(ada);
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), grace.name);
  await fill(page.getByLabelText("Email"), grace.email);
  await fill(page.getByLabelText("Password"), grace.password);
  await click(page.getByRole("button", { name: "Create account" }));

  await expect.element(page.getByText("Welcome, Grace Hopper!")).toBeInTheDocument();
});

test("ends only the session that signs out", async () => {
  const user = await signedIn();
  await createSession(user.id);
  await renderServer({ url: "/notes" });

  await click(page.getByRole("button", { name: "Sign out" }));

  await expect.element(page.getByText("You are signed out.")).toBeInTheDocument();
  expect(await sessionCount()).toBe(1);
});

test("favorites only the note of the user", async () => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Groceries" }]);
  const user = await signedIn(grace);
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/2" });

  await click(page.getByRole("button", { name: "Favorite", exact: true }));

  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  expect((await storedNotes()).map((note) => note.favorite)).toEqual([false, true]);
});

test("deletes only the note of the user", async () => {
  const other = await createUser(ada);
  await seedNotes(other.id, [{ title: "Groceries" }]);
  const user = await signedIn(grace);
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/2" });

  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([{ title: "Groceries", content: "", favorite: false }]);
});
