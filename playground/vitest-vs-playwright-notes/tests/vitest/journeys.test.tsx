import { expect } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { createUser, seedNotes } from "#test/db.ts";
import { ada } from "#test/people.ts";
import { expectTitles, signedIn, test } from "#test/vitest.ts";

test("goes from the home page to sign up", async () => {
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "Create an account" }).click();

  await expect
    .element(page.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
});

test("goes from the home page to sign in", async () => {
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "Sign in" }).click();

  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});

test("goes from the profile back to the notes", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await page.getByRole("link", { name: "Notes", exact: true }).click();

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("signs up and writes a first note", async ({ people }) => {
  await renderServer({ url: "/sign-up" });

  await page.getByLabelText("Name").fill(people.ada.name);
  await page.getByLabelText("Email").fill(people.ada.email);
  await page.getByLabelText("Password").fill(people.ada.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "New note" }).click();
  await page.getByLabelText("Title").fill("First note");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["First note"]);
});

test("signs in, searches and opens a note", async ({ people }) => {
  const user = await createUser(people.ada);
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }, { title: "Ideas" }]);
  await renderServer({ url: "/sign-in" });

  await page.getByLabelText("Email").fill(people.ada.email);
  await page.getByLabelText("Password").fill(people.ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
  await page.getByLabelText("Search").fill("oat");
  await page.getByRole("button", { name: "Search" }).click();
  // The results, before a click: the list before the search has the link too.
  await expectTitles(["Groceries"]);
  await page.getByRole("link", { name: "Groceries" }).click();

  await expect.element(page.getByText("Oat milk")).toBeInTheDocument();
});

test("writes, edits and lists a note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Draft");
  await page.getByRole("button", { name: "Create note" }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabelText("Title").fill("Final");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expectTitles(["Final"]);
});

test("writes and favorites a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Older" }]);
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Newer");
  await page.getByRole("button", { name: "Create note" }).click();
  await page.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await page.getByRole("link", { name: "All notes" }).click();

  await expect.element(page.getByText("★ Favorite")).toBeInTheDocument();
  await expectTitles(["Newer", "Older"]);
});

test("writes and deletes a note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Temporary");
  await page.getByRole("button", { name: "Create note" }).click();
  await page.getByRole("button", { name: "Delete" }).click();

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("signs out and back in", async () => {
  const user = await signedIn();
  await renderServer({ url: "/notes" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabelText("Email").fill(user.email);
  await page.getByLabelText("Password").fill(ada.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("renames oneself and sees the name in the header", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByLabelText("Name").fill("Countess Lovelace");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect.element(page.getByText("Name saved.")).toBeInTheDocument();
  await page.getByRole("link", { name: "Notes", exact: true }).click();

  await expect.element(page.getByText("Signed in as Countess Lovelace")).toBeInTheDocument();
});
